const mangayomiSources = [{
    "name": "Hstream",
    "id": 987654321,
    "baseUrl": "https://hstream.moe",
    "lang": "en",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://hstream.moe",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": true,
    "sourceCodeUrl": "",
    "apiUrl": "",
    "version": "1.3.1",
    "isManga": false,
    "itemType": 1,
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "notes": "",
    "pkgPath": "anime/src/en/hstream.js"
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
        };
    }

    _parseVideoList(doc) {
        const list = [];
        const items = doc.select("div.items-center div.w-full > a");

        for (const item of items) {
            const name = item.selectFirst("img")?.attr("alt") || "No Title";
            const link = item.getHref;
            const imageUrl = this.source.baseUrl + item.selectFirst("img")?.getSrc;

            if (link.includes("/hentai/")) {
                list.push({ name, link, imageUrl });
            }
        }
        return list;
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/search?order=view-count&page=${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return { list, hasNextPage: list.length > 0 };
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/search?order=recently-uploaded&page=${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return { list, hasNextPage: list.length > 0 };
    }

    async search(query, page, filters) {
        if (page > 1) return { list: [], hasNextPage: false };
        const url = `${this.source.baseUrl}/search?search=${encodeURIComponent(query)}&page=${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return { list, hasNextPage: false };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const infoContainer = doc.selectFirst("div.relative > div.justify-between > div");
        const name = infoContainer.selectFirst("div > h1")?.text?.trim() || "No Title";
        const author = infoContainer.selectFirst("div > a:nth-of-type(3)")?.text?.trim();

        let imageUrl = doc.selectFirst("div.float-left > img.object-cover")?.getSrc;
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = this.source.baseUrl + imageUrl;
        }

        const description = doc.selectFirst("div.relative > p.leading-tight")?.text;
        const genres = doc.select("ul.list-none > li > a").map(it => it.text);
        const status = 1; // Completed

        // --- New logic to extract data for the API call ---
        const episodeId = doc.selectFirst("input#e_id")?.attr("value");
        const csrfToken = doc.selectFirst("script[data-csrf]")?.attr("data-csrf");

        if (!episodeId || !csrfToken) {
            throw new Error("Could not extract required tokens from the page. The page structure may have changed.");
        }
        
        // Pass necessary data to getVideoList via the chapter URL
        const chapterUrl = JSON.stringify({
            episodeId,
            csrfToken,
            url // The original URL for the Referer header
        });

        const chapters = [{
            name: "Watch",
            url: chapterUrl
        }];

        return {
            name,
            author,
            imageUrl,
            description,
            genre: genres,
            status,
            chapters,
            link: url
        };
    }
    
    // Helper function to determine the correct video path
    _getVideoUrlPath(isLegacy, resolution) {
        if (isLegacy) {
            return (resolution === "720") ? "/x264.720p.mp4" : `/av1.${resolution}.webm`;
        } else {
            return `/${resolution}/manifest.mpd`;
        }
    }
    
    async getVideoList(url) {
        // Parse the JSON string passed from getDetail
        const { episodeId, csrfToken, url: refererUrl } = JSON.parse(url);

        const apiUrl = `${this.source.baseUrl}/player/api`;

        // Prepare headers for the API request
        const apiHeaders = this.getHeaders(refererUrl);
        apiHeaders["X-Requested-With"] = "XMLHttpRequest";
        apiHeaders["X-XSRF-TOKEN"] = csrfToken;
        apiHeaders["Content-Type"] = "application/json";

        // Prepare the request body
        const requestBody = { "episode_id": episodeId };

        // Make the authenticated POST request
        const res = await this.client.post(apiUrl, apiHeaders, requestBody);
        const data = JSON.parse(res.body);

        // Select a random stream domain
        const urlBase = data.stream_domains[Math.floor(Math.random() * data.stream_domains.length)] + "/" + data.stream_url;
        
        const subtitles = [{
            file: `${urlBase}/eng.ass`,
            label: "English",
        }];
        
        // Determine available resolutions
        const resolutions = ["720", "1080"];
        if (data.resolution === "4k") {
            resolutions.push("2160");
        }

        const streams = resolutions.map(resolution => {
            const videoPath = this._getVideoUrlPath(data.legacy !== 0, resolution);
            const videoUrl = urlBase + videoPath;
            return {
                url: videoUrl,
                originalUrl: videoUrl,
                quality: `${resolution}p`,
                headers: this.getHeaders(refererUrl),
                subtitles: subtitles
            };
        });
        
        // Sort streams by preferred quality
        const prefQuality = this.getPreference("pref_quality_key") || "1080";
        const sortedStreams = streams.sort((a, b) => {
            if (a.quality.includes(prefQuality)) return -1;
            if (b.quality.includes(prefQuality)) return 1;
            // Fallback to sorting by resolution descending
            return parseInt(b.quality) - parseInt(a.quality);
        });

        return sortedStreams;
    }

    getSourcePreferences() {
        return [{
            key: "pref_quality_key",
            listPreference: {
                title: "Preferred quality",
                summary: "Choose your preferred video quality",
                valueIndex: 1,
                entries: ["720p (HD)", "1080p (FullHD)", "2160p (4K)"],
                entryValues: ["720", "1080", "2160"],
            },
        }, ];
    }
}
