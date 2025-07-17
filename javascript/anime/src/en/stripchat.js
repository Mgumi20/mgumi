// Metadata for the Mangayomi app
const mangayomiSources = [{
    "name": "Stripchat",
    "id": 20240718, // Unique ID for the source
    "baseUrl": "https://stripchat.com",
    "lang": "en",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=stripchat.com",
    "isNsfw": true,
    "version": "1.0.0",
    "itemType": 1,
    "pkgPath": "anime/src/en/stripchat.js" // Path in the extension repository
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiUrl = "https://stripchat.com/api/front/models/get-list";
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // Headers needed for requests
    getHeaders(referer = this.source.baseUrl) {
        return {
            "Referer": referer,
            "Origin": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        };
    }

    /**
     * Helper function to get room lists from the Stripchat API.
     * @param {string} category - The primary tag for the category (e.g., "girls").
     * @param {number} page - The page number.
     * @returns {Promise<object>} - A promise resolving to a list of rooms and pagination info.
     */
    async _getApiRoomList(category, page) {
        const offset = page > 1 ? 60 * (page - 1) : 0;
        const payload = {
            "limit": 60,
            "offset": offset,
            "primaryTag": category,
            "sortBy": "viewersRating"
            // Other parameters from Kotlin code can be added if needed
        };

        try {
            const res = await this.client.post(this.apiUrl, this.getHeaders(), payload);
            const data = JSON.parse(res.body);
            const list = [];

            if (data && data.models) {
                for (const model of data.models) {
                    list.push({
                        name: model.username,
                        link: `${this.source.baseUrl}/${model.username}`,
                        imageUrl: model.previewUrlThumbSmall
                    });
                }
            }
            // The API doesn't give a total page count, so we assume there's always a next page.
            return { list, hasNextPage: list.length > 0 };
        } catch (e) {
            console.error("Failed to fetch from Stripchat API for category: " + category, e);
            return { list: [], hasNextPage: false };
        }
    }

    // Uses the API to get popular/latest models for a given category from the filters.
    async getPopular(page) {
        // Default to "girls" category for the main popular page.
        return this._getApiRoomList("girls", page);
    }
    
    async getLatestUpdates(page) {
        // Also default to "girls" for latest, as the API sorts by rating, not time.
        return this._getApiRoomList("girls", page);
    }

    // Handles both filtered API calls and text-based search scraping.
    async search(query, page, filters) {
        if (query) {
            // If there's a search query, scrape the website.
            const url = `${this.source.baseUrl}/search/models/${encodeURIComponent(query)}?page=${page}`;
            const doc = new Document((await this.client.get(url, this.getHeaders())).body);
            const list = [];
            doc.select(".model-list-item").forEach(element => {
                const name = element.selectFirst(".model-list-item-username")?.text;
                const link = this.source.baseUrl + element.selectFirst(".model-list-item-link")?.attr("href");
                const imageUrl = element.selectFirst(".image-background")?.attr("src");
                if (name && link) {
                    list.push({ name, link, imageUrl });
                }
            });
            // Scraping doesn't easily provide hasNextPage, so we assume false for simplicity.
            return { list, hasNextPage: list.length > 0 };
        } else {
            // If no query, use the filters to call the API.
            const categoryFilter = filters[0];
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;
            return this._getApiRoomList(selectedCategory, page);
        }
    }

    // Gets details for a specific room by scraping meta tags.
    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const name = doc.selectFirst("meta[property='og:title']")?.attr("content")?.trim() || "Unknown";
        const imageUrl = doc.selectFirst("meta[property='og:image']")?.attr("content");
        const description = doc.selectFirst("meta[property='og:description']")?.attr("content")?.trim();
        
        const chapters = [{ name: "Live Stream", url: url }];

        return { name, imageUrl, description, chapters, link: url };
    }

    async _extractQualitiesFromM3U8(masterUrl, headers) {
        const qualities = [];
        try {
            const res = await this.client.get(masterUrl, { headers });
            const masterContent = res.body;
            const lines = masterContent.split('\n');
            const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    const resolutionMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                    const qualityLabel = resolutionMatch ? `${resolutionMatch[1]}p` : "Stream";
                    if (i + 1 < lines.length) {
                        const mediaPlaylistUrl = baseUrl + lines[i + 1].trim();
                        qualities.push({ url: mediaPlaylistUrl, originalUrl: mediaPlaylistUrl, quality: qualityLabel, headers: headers });
                    }
                }
            }
        } catch (e) {
            console.error("Failed to extract qualities from Stripchat M3U8:", e);
        }
        return qualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const html = res.body;

        const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{.*?\});/);
        if (!stateMatch || !stateMatch[1]) {
            throw new Error("Could not find or extract window.__PRELOADED_STATE__ data.");
        }

        let roomData;
        try {
            roomData = JSON.parse(stateMatch[1]);
        } catch (e) {
            throw new Error("Could not parse the __PRELOADED_STATE__ JSON.");
        }

        const modelInfo = roomData.model.data.model;
        const streamName = modelInfo.streamName;
        const streamHost = modelInfo.hlsStreamHost;
        const hlsUrlTemplate = modelInfo.hlsStreamUrlTemplate;

        if (!streamName || !streamHost || !hlsUrlTemplate) {
            throw new Error("Stream information is missing from the page data.");
        }

        const masterM3u8Url = hlsUrlTemplate
            .replace("{cdnHost}", streamHost)
            .replace("{streamName}", streamName)
            .replace("{suffix}", "_auto");
            
        // For Stripchat, the referer is often not needed for the CDN link, so we send an empty one as per the Kotlin code.
        const streamHeaders = { "Referer": "" };

        const masterStream = { url: masterM3u8Url, originalUrl: masterM3u8Url, quality: "Auto (Live)", headers: streamHeaders };
        const individualQualities = await this._extractQualitiesFromM3U8(masterM3u8Url, streamHeaders);
        
        const allStreams = [masterStream, ...individualQualities];
        
        const preferredQuality = this.getPreference('preferred_quality') || 'auto';
        if (preferredQuality === 'auto') {
            return allStreams;
        }

        const foundIndex = allStreams.findIndex(s => s.quality.includes(preferredQuality));
        if (foundIndex > -1) {
            const [preferredStream] = allStreams.splice(foundIndex, 1);
            allStreams.unshift(preferredStream);
        }
        
        return allStreams;
    }

    getFilterList() {
        const categories = [
            { name: "Girls", value: "girls" },
            { name: "Couples", value: "couples" },
            { name: "Men", value: "men" },
            { name: "Trans", value: "trans" },
        ];
        
        const filterValues = categories.map(cat => ({ type_name: "SelectOption", name: cat.name, value: cat.value }));

        return [{
            type_name: "SelectFilter",
            name: "Category",
            state: 0,
            values: filterValues
        }];
    }
    
    getSourcePreferences() {
        return [{
            key: 'preferred_quality',
            listPreference: {
                title: 'Preferred Video Quality',
                summary: 'Select the default quality for streams.',
                valueIndex: 0,
                entries: ["Auto (Live)", "1080p", "720p", "480p", "360p", "240p"],
                entryValues: ["auto", "1080", "720", "480", "360", "240"]
            }
        }];
    }
}
