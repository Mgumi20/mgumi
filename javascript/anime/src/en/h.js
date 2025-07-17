const mangayomiSources = [{
    "name": "H",
    "id": 987654568,
    "baseUrl": "https://chaturbate.com",
    "lang": "en",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://chaturbate.com",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": true,
    "sourceCodeUrl": "",
    "apiUrl": "",
    "version": "1.0.5",
    "isManga": false,
    "itemType": 1,
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "notes": "",
    "pkgPath": "anime/src/en/h.js"
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };
    }

    /**
     * This is YOUR parsing function for listing items from the site.
     * It is designed for the card layout on the target site.
     * @param {Document} doc - The parsed HTML document.
     * @returns {Array<{name: string, link: string, imageUrl: string}>}
     * @private
     */
    _parseVideoList(doc) {
        const list = [];
        // This selector targets the <li> elements (room cards).
        const items = doc.select("li.room_list_room.roomCard");

        for (const item of items) {
            const anchor = item.selectFirst("a.no_select");
            if (!anchor) continue;

            const name = anchor.selectFirst("img")?.attr("alt")?.replace("'s chat room", "").trim() || "No Title";
            // Make sure the link is absolute.
            const link = new URL(anchor.getHref, this.source.baseUrl).href;
            const imageUrl = anchor.selectFirst("img")?.getSrc || "";

            list.push({ name, link, imageUrl });
        }
        return list;
    }

    /**
     * This is YOUR function to get the popular list.
     * It uses the correct URL and your parsing function.
     */
    async getPopular(page) {
        // The page number is part of the URL path on this site.
        const url = `${this.source.baseUrl}/tours/${page}/`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return { list, hasNextPage: list.length > 0 };
    }

    /**
     * The site's "new" section is similar to popular.
     */
    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/?page=${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return { list, hasNextPage: list.length > 0 };
    }
    
    /**
     * Search function adapted for the target site.
     */
    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/tag/${encodeURIComponent(query)}/?page=${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return { list, hasNextPage: list.length > 0 };
    }

    /**
     * CORRECTED: Fetches details for a live stream room.
     * Its main job is to provide a single chapter to click to start playback.
     * @param {string} url - The URL of the live stream room.
     */
    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        
        // On a live site, we get the name and image again from the room page.
        const name = doc.selectFirst("div.room-title h1")?.text?.trim() || "Live Stream";
        const imageUrl = doc.selectFirst("meta[property='og:image']")?.attr("content") || "";

        // Create a single "chapter" to trigger the video player.
        const chapters = [{
            name: "Watch Live",
            url: url // Pass the room URL to getVideoList.
        }];

        return {
            name,
            imageUrl,
            description: `Live stream from ${name}.`,
            chapters,
            link: url
        };
    }

    /**
     * CORRECTED: Fetches the live stream (.m3u8) URL.
     * This is the key function that enables playback.
     * @param {string} url - The URL of the room page.
     */
    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const body = res.body;

        // Use a regular expression to find the HLS manifest URL in the page's script tags.
        // This is a common pattern: "hls_source":"<url>"
        const match = body.match(/hls_source"\s*:\s*"(.*?)"/);
        
        if (!match || !match[1]) {
            throw new Error("Could not find the live stream URL (.m3u8). The room may be offline or the site structure may have changed.");
        }

        const streamUrl = match[1].replace(/\\u002F/g, "/"); // Unescape JSON-encoded slashes

        // Return the stream URL for the player.
        return [{
            url: streamUrl,
            originalUrl: streamUrl,
            quality: "Live",
            headers: this.getHeaders(url),
        }];
    }
    
    // No preferences needed for this source type.
    getSourcePreferences() {
        return [];
    }
}
