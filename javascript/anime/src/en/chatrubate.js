const mangayomiSources = [{
    "name": "Chatrubate",
    "id": 192837465,
    "baseUrl": "https://chaturbate.com",
    "lang": "en",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=chaturbate.com",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": true,
    "sourceCodeUrl": "",
    "apiUrl": "",
    "version": "1.0.8",
    "isManga": false,
    "itemType": 1,
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "notes": "",
    "pkgPath": "anime/src/en/chatrubate.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // This function creates the necessary headers to make requests look legitimate.
    getHeaders(referer = this.source.baseUrl) {
        return {
            "Referer": referer,
            "Origin": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        };
    }

    // Helper function to parse room lists from the API response.
    async _parseApiResponse(url) {
        try {
            const res = await this.client.get(url, this.getHeaders());
            const data = JSON.parse(res.body);
            const list = [];
            if (data && data.rooms) {
                for (const room of data.rooms) {
                    list.push({
                        name: room.username,
                        link: `${this.source.baseUrl}/${room.username}/`,
                        imageUrl: room.image_url_360x270 || room.img // Use a more reliable image source if available
                    });
                }
            }
            return {
                list,
                hasNextPage: list.length > 0
            };
        } catch (e) {
            // If the API fails, return an empty list instead of crashing.
            console.error("Failed to parse API response from: " + url);
            return { list: [], hasNextPage: false };
        }
    }

    // 'getPopular' will always show the "Featured" category.
    async getPopular(page) {
        const offset = page > 1 ? 90 * (page - 1) : 0;
        const url = `${this.source.baseUrl}/api/ts/roomlist/room-list/?limit=90&offset=${offset}`;
        return await this._parseApiResponse(url);
    }

    // 'getLatestUpdates' will also show "Featured" as the default.
    async getLatestUpdates(page) {
        const offset = page > 1 ? 90 * (page - 1) : 0;
        const url = `${this.source.baseUrl}/api/ts/roomlist/room-list/?limit=90&offset=${offset}`;
        return await this._parseApiResponse(url);
    }

    // Updated search function to use the new filters.
    async search(query, page, filters) {
        const offset = page > 1 ? 90 * (page - 1) : 0;
        let url = "";

        if (query) {
            // If there's a search query, use the hashtag search.
            url = `${this.source.baseUrl}/api/ts/roomlist/room-list/?hashtags=${encodeURIComponent(query)}&limit=90&offset=${offset}`;
        } else {
            // If there's no query, use the selected filter.
            const categoryFilter = filters[0];
            const selectedCategoryPath = categoryFilter.values[categoryFilter.state].value;
            url = `${this.source.baseUrl}${selectedCategoryPath}&offset=${offset}`;
        }
        
        return await this._parseApiResponse(url);
    }

    // Gets details for a specific room by scraping meta tags.
    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const name = doc.selectFirst("meta[property='og:title']")?.attr("content")?.trim() || "Unknown";
        const imageUrl = doc.selectFirst("meta[property='og:image']")?.attr("content");
        const description = doc.selectFirst("meta[property='og:description']")?.attr("content")?.trim();
        
        // A live stream is treated as a single "chapter".
        const chapters = [{
            name: "Live Stream",
            url: url // Pass the room's URL to getVideoList.
        }];

        return {
            name,
            imageUrl,
            description,
            chapters,
            link: url,
        };
    }
    
    // Unescapes unicode characters like \u0022 to ".
    _unescapeUnicode(str) {
        return str.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
            return String.fromCharCode(parseInt(grp, 16));
        });
    }

    // This is the most critical function. It finds the actual video stream URL.
    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const html = res.body;
        
        // IMPROVEMENT: Use a more robust regex to extract the JSON data directly.
        // This is less likely to break than splitting the string.
        const dossierMatch = html.match(/window\.initialRoomDossier\s*=\s*"(.*?)";/);

        if (!dossierMatch || !dossierMatch[1]) {
            throw new Error("Could not find or extract window.initialRoomDossier data.");
        }
        
        let jsonString = dossierMatch[1];
        
        // The string is double-escaped (e.g., \\u0022). We need to replace \\ with \ first.
        jsonString = jsonString.replace(/\\\\/g, '\\');
        
        const unescapedJson = this._unescapeUnicode(jsonString);

        let roomData;
        try {
            // IMPROVEMENT: Parse the full JSON to safely access properties.
            roomData = JSON.parse(unescapedJson);
        } catch (e) {
            console.error("Failed to parse room dossier JSON:", e);
            console.error("Unescaped JSON string:", unescapedJson);
            throw new Error("Could not parse the room data JSON.");
        }

        const m3u8Url = roomData.hls_source;
        
        if (!m3u8Url) {
            throw new Error("Could not find M3U8 stream URL (hls_source) in the room data.");
        }

        // THIS IS THE FIX: Return the URL along with the necessary headers.
        // The 'Referer' header is crucial for the video server to accept the request.
        return [{
            url: m3u8Url,
            originalUrl: m3u8Url,
            quality: "Live",
            headers: this.getHeaders(url)
        }];
    }

    // A simple filter list based on main page categories.
    getFilterList() {
        const mainPageCategories = [
            { name: "Featured", value: "/api/ts/roomlist/room-list/?limit=90" },
            { name: "Male", value: "/api/ts/roomlist/room-list/?genders=m&limit=90" },
            { name: "Female", value: "/api/ts/roomlist/room-list/?genders=f&limit=90" },
            { name: "Couples", value: "/api/ts/roomlist/room-list/?genders=c&limit=90" },
            { name: "Trans", value: "/api/ts/roomlist/room-list/?genders=t&limit=90" },
        ];

        const filterValues = mainPageCategories.map(cat => ({
            type_name: "SelectOption",
            name: cat.name,
            value: cat.value
        }));

        return [{
            type_name: "SelectFilter",
            name: "Category",
            state: 0, // Default value is "Featured".
            values: filterValues
        }];
    }
    
    // No specific preferences are needed for this source.
    getSourcePreferences() {
        return [];
    }
}
