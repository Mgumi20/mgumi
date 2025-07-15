const mangayomiSources = [{
    "name": "HStream",
    "id": 839235891,
    "baseUrl": "https://hstream.moe",
    "lang": "en",
    "typeSource": "multi",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://hstream.moe",
    "isNsfw": true,
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/hstream.js",
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders(referer = this.source.baseUrl) {
        return {
            "Referer": referer,
            "Origin": this.source.baseUrl,
        };
    }

    _parseVideoList(doc) {
        const list = [];
        const items = doc.select("div.items-center div.w-full > a");

        for (const item of items) {
            const name = item.selectFirst("img")?.attr("alt") || "No Title";
            const link = item.getHref;
            const imageUrl = item.selectFirst("img")?.getSrc;

            list.push({
                name,
                link,
                imageUrl
            });
        }
        return list;
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/search?order=view-count&page=${page}`;
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return {
            list,
            hasNextPage: list.length > 0
        };
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/search?order=recently-uploaded&page=${page}`;
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return {
            list,
            hasNextPage: list.length > 0
        };
    }

    async search(query, page, filters) {
        // The site's search pagination seems limited. The original code checks up to page 2.
        if (page > 2) {
             return { list: [], hasNextPage: false };
        }
        const url = `${this.source.baseUrl}/search?search=${encodeURIComponent(query)}&page=${page}`;
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        const list = this._parseVideoList(doc);
        return {
            list,
            hasNextPage: list.length > 0 && page < 2
        };
    }

    async getDetail(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        const name = doc.selectFirst("div.relative h1")?.text?.trim() || "No Title";
        const imageUrl = doc.selectFirst("meta[property=og:image]")?.attr("content");
        const description = doc.selectFirst("meta[property=og:description]")?.attr("content");
        const genres = doc.select("ul.list-none.text-center li a").map(it => it.text);

        // This source provides single videos, not series with episodes.
        // We create a single "chapter" that links to the video itself.
        const chapters = [{
            name: "Watch",
            url: url
        }];

        return {
            name,
            imageUrl,
            description,
            genre: genres,
            chapters,
            link: url
        };
    }

    _getVideoUrlPath(isLegacy, resolution) {
        if (isLegacy) {
            return (resolution === "720") ? "/x264.720p.mp4" : `/av1.${resolution}.webm`;
        }
        return `/${resolution}/manifest.mpd`;
    }

    async getVideoList(url) {
        const initialRes = await this.client.get(url);
        const doc = new Document(initialRes.body);

        // Extract cookies and XSRF-TOKEN from the initial response
        const cookies = initialRes.headers['Set-Cookie'] || '';
        const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('XSRF-TOKEN='));
        const token = tokenCookie ? decodeURIComponent(tokenCookie.split('=')[1]) : '';

        const episodeId = doc.selectFirst("input#e_id")?.attr("value");
        if (!episodeId) {
            throw new Error("Could not find episode ID.");
        }

        const apiHeaders = {
            ...this.getHeaders(url),
            "X-Requested-With": "XMLHttpRequest",
            "X-XSRF-TOKEN": token,
            "Cookie": cookies,
            "Content-Type": "application/json"
        };
        const apiBody = { "episode_id": episodeId };

        const apiRes = await this.client.post(`${this.source.baseUrl}/player/api`, apiHeaders, apiBody);
        const playerData = JSON.parse(apiRes.body);

        if (!playerData || !playerData.stream_url) {
            throw new Error("Failed to fetch player data from API.");
        }

        const streams = [];
        const streamBaseUrl = `${playerData.stream_domains[0]}/${playerData.stream_url}`;
        
        const resolutions = ["720", "1080"];
        if(playerData.resolution === "4k") resolutions.push("2160");
        
        for (const res of resolutions) {
            const videoUrl = streamBaseUrl + this._getVideoUrlPath(playerData.legacy !== 0, res);
            streams.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: `${res}p`,
                headers: this.getHeaders(), // Simple referer header should suffice for video chunks
            });
        }
        
        // Add subtitles to the first stream object
        if (streams.length > 0) {
            streams[0].subtitles = [{
                file: `${streamBaseUrl}/eng.ass`,
                label: "English"
            }];
        }

        return streams;
    }
}
