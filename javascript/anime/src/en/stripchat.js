const mangayomiSources = [{
    "name": "Stripchat",
    "id": 987654573,
    "baseUrl": "https://stripchat.com",
    "lang": "en",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=stripchat.com",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": true,
    "sourceCodeUrl": "",
    "apiUrl": "https://stripchat.com/api/front/v2/models",
    "version": "1.0.7",
    "isManga": false,
    "itemType": 1,
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "notes": "",
    "pkgPath": "anime/src/en/stripchat.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getHeaders(referer = this.source.baseUrl) {
        return {
            "Referer": referer,
            "Origin": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*"
        };
    }

    async _fetchModels(page, category, sortBy) {
        const limit = 50;
        const offset = (page - 1) * limit;

        const params = new URLSearchParams({
            limit: limit,
            offset: offset,
            primaryTag: category,
            sortBy: sortBy,
            userRole: 'guest'
        });
        const url = `${this.source.apiUrl}?${params.toString()}`;

        try {
            const res = await this.client.get(url, this.getHeaders());
            const data = JSON.parse(res.body);

            const list = data.models.map((model) => ({
                name: model.username,
                link: `${this.source.baseUrl}/${model.username}`,
                imageUrl: model.previewUrlThumbSmall
            }));

            const hasNextPage = (page * limit) < data.totalCount;
            return { list, hasNextPage };
        } catch (e) {
            console.error("Failed to fetch models from: " + url, e);
            return { list: [], hasNextPage: false };
        }
    }

    async getPopular(page) {
        const category = this.getPreference("stripchat_popular_category") || "girls";
        return await this._fetchModels(page, category, "viewersRating");
    }

    async getLatestUpdates(page) {
        const category = this.getPreference("stripchat_latest_category") || "girls";
        return await this._fetchModels(page, category, "new");
    }

    async search(query, page, filters) {
        // Search is not paginated on the site, so we ignore the page parameter.
        if (page > 1) return { list: [], hasNextPage: false };

        const url = `${this.source.baseUrl}/search/models/${query}`;
        const res = await this.client.get(url, { "Accept": "text/html" });
        const doc = new Document(res.body);

        const list = doc.select(".model-list-item").map((it) => {
            const title = it.selectFirst(".model-list-item-username").text;
            const href = this.source.baseUrl + it.selectFirst(".model-list-item-link").getHref;
            const posterUrl = it.selectFirst(".image-background")?.getSrc;
            const imageUrl = posterUrl ? this.source.baseUrl + posterUrl : "";
            return { name: title, link: href, imageUrl: imageUrl };
        });

        return { list, hasNextPage: false };
    }

    async getDetail(url) {
        const res = await this.client.get(url, { "Accept": "text/html" });
        const doc = new Document(res.body);

        const name = doc.selectFirst("meta[property='og:title']")?.attr("content")?.replace(" on Stripchat", "")?.trim() || "Unknown";
        const imageUrl = doc.selectFirst("meta[property='og:image']")?.attr("content");
        const description = doc.selectFirst("meta[property='og:description']")?.attr("content")?.trim();

        const chapters = [{ name: "Live Stream", url: url }];

        return { name, imageUrl, description, chapters, link: url };
    }

    _unescapeUnicode(str) {
        return str.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
            return String.fromCharCode(parseInt(grp, 16));
        });
    }

    async _extractQualitiesFromM3U8(masterUrl, headers) {
        const qualities = [];
        try {
            const res = await this.client.get(masterUrl, { headers });
            const masterContent = res.body;

            const lines = masterContent.split('\n');
            const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith("#EXT-X-STREAM-INF")) {
                    const resolutionMatch = line.match(/RESOLUTION=\d+x(\d+)/);
                    const qualityLabel = resolutionMatch ? `${resolutionMatch[1]}p` : "Stream";
                    
                    if (i + 1 < lines.length && lines[i + 1].trim().length > 0) {
                        let mediaPlaylistUrl = lines[i + 1].trim();
                        if (!mediaPlaylistUrl.startsWith('http')) {
                            mediaPlaylistUrl = baseUrl + mediaPlaylistUrl;
                        }
                        qualities.push({
                            url: mediaPlaylistUrl,
                            originalUrl: mediaPlaylistUrl,
                            quality: qualityLabel,
                            headers: headers
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Failed to extract qualities from M3U8:", e);
        }
        return qualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
    }

    async getVideoList(url) {
        const res = await this.client.get(url, { "Accept": "text/html" });
        const doc = new Document(res.body);

        const scriptElement = doc.select("script").find((el) => el.text.includes("window.__PRELOADED_STATE__"));
        if (!scriptElement) throw new Error("Could not find stream data (__PRELOADED_STATE__).");
        
        const scriptContent = this._unescapeUnicode(scriptElement.text);
        const jsonString = scriptContent.substring(scriptContent.indexOf("{"), scriptContent.lastIndexOf("}") + 1);
        const state = JSON.parse(jsonString);
        
        const modelData = state?.model?.data || state?.modelData;
        if (!modelData) throw new Error("Could not parse model data from page.");

        const streamName = modelData.streamName;
        const streamHost = modelData.hlsStreamHost;
        const hlsUrlTemplate = modelData.hlsStreamUrlTemplate;
        if (!streamName || !streamHost || !hlsUrlTemplate) throw new Error("Required stream information not found in page data.");

        const masterM3u8Url = hlsUrlTemplate.replace("{cdnHost}", streamHost).replace("{streamName}", streamName).replace("{suffix}", "_auto");
        const streamHeaders = this.getHeaders(url);
        
        const masterStream = {
            url: masterM3u8Url,
            originalUrl: masterM3u8Url,
            quality: "Auto (Live)",
            headers: streamHeaders
        };

        const individualQualities = await this._extractQualitiesFromM3U8(masterM3u8Url, streamHeaders);
        const allStreams = [masterStream, ...individualQualities];
        
        const preferredQuality = this.getPreference('preferred_quality') || 'auto';
        if (preferredQuality === 'auto') return allStreams;
        
        const foundIndex = allStreams.findIndex(stream => stream.quality.includes(preferredQuality));
        if (foundIndex > -1) {
            const [preferredStream] = allStreams.splice(foundIndex, 1);
            allStreams.unshift(preferredStream);
        }

        return allStreams;
    }

    getSourcePreferences() {
        return [
            {
                key: "stripchat_popular_category",
                listPreference: {
                    title: "Popular Category",
                    summary: "Select the category for the Popular tab",
                    valueIndex: 0,
                    entries: ["Girls", "Couples", "Men", "Trans"],
                    entryValues: ["girls", "couples", "men", "trans"],
                },
            },
            {
                key: "stripchat_latest_category",
                listPreference: {
                    title: "Latest (New Models) Category",
                    summary: "Select the category for the Latest tab",
                    valueIndex: 0,
                    entries: ["Girls", "Couples", "Men", "Trans"],
                    entryValues: ["girls", "couples", "men", "trans"],
                },
            },
            {
                key: 'preferred_quality',
                listPreference: {
                    title: 'Preferred Video Quality',
                    summary: 'The app will try to select this quality by default.',
                    valueIndex: 0,
                    entries: ["Auto (Live)", "1080p", "720p", "480p", "360p", "240p"],
                    entryValues: ["auto", "1080", "720", "480", "360", "240"]
                }
            }
        ];
    }
}
