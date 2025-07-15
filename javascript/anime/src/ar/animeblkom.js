const mangayomiSources = [{
    "name": "AnimeBlkom",
    "id": 294348492,
    "lang": "ar",
    "baseUrl": "https://animeblkom.net",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://animeblkom.net",
    "typeSource": "multi",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/animeblkom.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders() {
        return {
            "Referer": this.source.baseUrl,
            "Origin": this.source.baseUrl,
        };
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    async _request(slug) {
        const url = this.source.baseUrl + slug;
        const res = await this.client.get(url, this.getHeaders());
        return new Document(res.body);
    }

    _parseAnimeList(doc) {
        const list = [];
        const items = doc.select("div.content-inner");

        for (const item of items) {
            const linkElement = item.selectFirst("div.poster a");
            const link = linkElement.getHref;
            const name = item.selectFirst("div.name a").text;
            const imageUrl = this.source.baseUrl + item.selectFirst("div.poster img").attr("data-original");
            list.push({
                name,
                link,
                imageUrl
            });
        }
        // The site uses infinite scrolling, but the pages are accessible via URL.
        // We'll check for the presence of items to determine if there might be a next page.
        const hasNextPage = list.length > 0;
        return {
            list,
            hasNextPage
        };
    }

    async getPopular(page) {
        const doc = await this._request(`/anime-list?sort_by=rate&page=${page}`);
        return this._parseAnimeList(doc);
    }

    async getLatestUpdates(page) {
        const doc = await this._request(`/anime-list?sort_by=created_at&page=${page}`);
        return this._parseAnimeList(doc);
    }

    async search(query, page, filters) {
        // The site's search does not seem to support pagination.
        if (page > 1) {
            return {
                list: [],
                hasNextPage: false
            };
        }
        const doc = await this._request(`/search?query=${encodeURIComponent(query)}`);
        const list = [];
        const items = doc.select("div.content.ratable");

        for (const item of items) {
            const linkElement = item.selectFirst("div.poster a");
            const link = linkElement.getHref;
            const name = item.selectFirst("div.name a").text;
            const imageUrl = this.source.baseUrl + item.selectFirst("div.poster img").attr("data-original");
            list.push({
                name,
                link,
                imageUrl
            });
        }
        return {
            list,
            hasNextPage: false
        };
    }

    async getDetail(url) {
        const doc = await this._request(url.replace(this.source.baseUrl, ""));

        const name = doc.selectFirst("span h1").text.replace(/\\(.*)/, "").trim();
        const imageUrl = this.source.baseUrl + doc.selectFirst("div.poster img").attr("data-original");
        const description = doc.selectFirst(".story p").text;
        const genres = doc.select("p.genres a").map(it => it.text);

        const statusText = doc.selectFirst(".info-table div:contains(حالة الأنمي) span.info").text;
        const status = statusText.includes("مستمر") ? 0 : 1; // 0: Ongoing, 1: Completed

        const chapters = [];
        const episodeElements = doc.select(".episode-link a");

        if (episodeElements.length === 0) {
            chapters.push({
                name: "Watch",
                url: url
            });
        } else {
            for (const el of episodeElements) {
                const epName = el.text.replace(":", " ");
                const epUrl = this.source.baseUrl + el.getHref;
                chapters.push({
                    name: epName,
                    url: epUrl
                });
            }
        }

        return {
            name,
            imageUrl,
            description,
            genre: genres,
            status,
            chapters: chapters.reverse(),
            link: url
        };
    }

    async getVideoList(url) {
        const doc = await this._request(url.replace(this.source.baseUrl, ""));
        const streams = [];

        const serverLinks = doc.select("div.item a[data-src]");

        for (const link of serverLinks) {
            const serverUrl = link.attr("data-src");
            const serverName = link.text;

            try {
                if (serverName === "Blkom") {
                    const iframeDoc = await this._request(serverUrl);
                    const sources = iframeDoc.select("source");
                    for (const source of sources) {
                        streams.push({
                            url: source.attr("src"),
                            originalUrl: source.attr("src"),
                            quality: `${serverName} - ${source.attr("res")}p`,
                            headers: this.getHeaders()
                        });
                    }
                } else if (serverUrl.includes("animetitans.net")) {
                     const iframeBody = (await this.client.get(serverUrl)).body;
                     const scriptContent = new Document(iframeBody).selectFirst("script:contains(source)").data;
                     const m3u8Url = scriptContent.substringAfter('source: "').substringBefore('"');
                     if(m3u8Url) {
                        streams.push({
                             url: m3u8Url,
                             originalUrl: m3u8Url,
                             quality: `Animetitans - ${serverName}`,
                             headers: { "Referer": "https://animetitans.net/" },
                             isM3U8: true,
                         });
                     }
                } else {
                    // For other generic servers, we can add them with a generic name
                    // In a real scenario, specific extractors would be needed here.
                    streams.push({
                        url: serverUrl,
                        originalUrl: serverUrl,
                        quality: `External - ${serverName}`,
                        headers: this.getHeaders()
                    });
                }
            } catch (e) {
                // Ignore errors for individual servers and continue
                console.log(`Failed to extract from server: ${serverName}`);
            }
        }
        
        // Add download links
        const downloadLinks = doc.select(".panel .panel-body a");
        for (const link of downloadLinks) {
             streams.push({
                url: link.attr("href"),
                originalUrl: link.attr("href"),
                quality: `Download - ${link.attr("title")} ${link.selectFirst("small").text}`,
                headers: this.getHeaders()
            });
        }

        return streams;
    }
}
