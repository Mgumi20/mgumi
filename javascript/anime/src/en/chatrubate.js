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
    "version": "1.1.7",
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
                        imageUrl: room.image_url_360x270 || room.img
                    });
                }
            }
            return {
                list,
                hasNextPage: list.length > 0
            };
        } catch (e) {
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

    // 'getLatestUpdates' will show female rooms by default.
    async getLatestUpdates(page) {
        const offset = page > 1 ? 90 * (page - 1) : 0;
        const url = `${this.source.baseUrl}/api/ts/roomlist/room-list/?genders=f&limit=90&offset=${offset}`;
        return await this._parseApiResponse(url);
    }

    // Updated search function to use the new filters.
    async search(query, page, filters) {
        const offset = page > 1 ? 90 * (page - 1) : 0;
        let url = "";

        if (query) {
            url = `${this.source.baseUrl}/api/ts/roomlist/room-list/?hashtags=${encodeURIComponent(query)}&limit=90&offset=${offset}`;
        } else {
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
        
        const chapters = [{
            name: "Live Stream",
            url: url
        }];

        return {
            name,
            imageUrl,
            description,
            chapters,
            link: url,
        };
    }
    
    _unescapeUnicode(str) {
        return str.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
            return String.fromCharCode(parseInt(grp, 16));
        });
    }

    // ====================================================================================
    // START: NEW AND UPDATED FUNCTIONS FOR EXTRACTING ALL VIDEO QUALITIES
    // ====================================================================================

    /**
     * Helper function to fetch a master M3U8 playlist and parse it to find all available quality streams.
     * @param {string} masterUrl - The URL of the master M3U8 playlist.
     * @param {object} headers - The necessary HTTP headers (especially the 'Referer').
     * @returns {Promise<Array>} - A promise that resolves to an array of video stream objects.
     */
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
                        const mediaPlaylistUrl = baseUrl + lines[i + 1].trim();
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
            return [];
        }
        return qualities.sort((a, b) => {
            const aRes = parseInt(a.quality);
            const bRes = parseInt(b.quality);
            return bRes - aRes;
        });
    }

    /**
     * This is the most critical function. It finds the master stream URL and then extracts all available qualities.
     * @param {string} url - The URL of the Chaturbate room.
     * @returns {Promise<Array>} - A promise that resolves to a list of all available video streams.
     */
    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const html = res.body;
        
        const dossierMatch = html.match(/window\.initialRoomDossier\s*=\s*"(.*?)";/);

        if (!dossierMatch || !dossierMatch[1]) {
            throw new Error("Could not find or extract window.initialRoomDossier data.");
        }
        
        let jsonString = dossierMatch[1];
        jsonString = jsonString.replace(/\\\\/g, '\\');
        const unescapedJson = this._unescapeUnicode(jsonString);

        let roomData;
        try {
            roomData = JSON.parse(unescapedJson);
        } catch (e) {
            console.error("Failed to parse room dossier JSON:", e);
            throw new Error("Could not parse the room data JSON.");
        }

        const masterM3u8Url = roomData.hls_source;
        
        if (!masterM3u8Url) {
            throw new Error("Could not find M3U8 stream URL (hls_source) in the room data.");
        }

        const streamHeaders = this.getHeaders(url);

        const masterStream = {
            url: masterM3u8Url,
            originalUrl: masterM3u8Url,
            quality: "Auto (Live)",
            headers: streamHeaders
        };

        const individualQualities = await this._extractQualitiesFromM3U8(masterM3u8Url, streamHeaders);
        
        const allStreams = [masterStream, ...individualQualities];

        return allStreams;
    }

    // ====================================================================================
    // END: NEW AND UPDATED FUNCTIONS
    // ====================================================================================


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
            state: 0,
            values: filterValues
        }];
    }
    
    // ====================================================================================
    // START: NEWLY ADDED PREFERENCES
    // ====================================================================================

    /**
     * Defines the settings that the user can configure for this source.
     */
    getSourcePreferences() {
        return [{
            key: 'preferred_quality', // A unique key for the setting
            listPreference: {
                title: 'Preferred Video Quality',
                summary: 'The application will try to select this quality by default when you open a stream.',
                valueIndex: 0, // Sets the default selection to the first item ("Auto")
                // The labels the user will see in the dropdown menu
                entries: ["Auto (Live)", "1080p", "720p", "480p", "360p", "240p"],
                // The actual values that get saved. These are used in the code to check the preference.
                entryValues: ["auto", "1080", "720", "480", "360", "240"]
            }
        }];
    }

    // ====================================================================================
    // END: NEWLY ADDED PREFERENCES
    // ====================================================================================
}
