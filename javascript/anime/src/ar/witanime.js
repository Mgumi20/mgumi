const mangayomiSources = [{
    "name": "WitAnime",
    "id": 984372845,
    "lang": "ar",
    "baseUrl": "https://witanime.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://witanime.com",
    "typeSource": "multi",
    "itemType": 1,
    "version": "2.0.0",
    "pkgPath": "anime/src/ar/witanime.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders() {
        return {
            "Referer": this.source.baseUrl,
        };
    }

    async _request(url) {
        const res = await this.client.get(url);
        return new Document(res.body);
    }

    _getIntFromText(text) {
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : null;
    }
    
    // Custom Base64 decoder to handle potential UTF-8 characters
    decodeBase64(str) {
        const decoded = atob(str);
        try {
            // Attempt to decode as UTF-8
            return decodeURIComponent(Array.prototype.map.call(decoded, function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        } catch (e) {
            // Fallback to original decoded string if UTF-8 decoding fails
            return decoded;
        }
    }


    _parseAnime(element) {
        const url = element.selectFirst("div.hover > a").getHref
            .replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/, "")
            .replace("/episode/", "/anime/");

        const name = element.selectFirst("div.hover > img").attr("alt");
        const imageUrl = element.selectFirst("div.hover > img").getSrc;

        return {
            name,
            link: url,
            imageUrl
        };
    }

    async getPopular(page) {
        // The site's main page contains multiple sections like "Popular", "Recent", etc.
        // We will combine them for the popular/latest feeds.
        const doc = await this._request(this.source.baseUrl);
        const list = [];
        const sections = doc.select(".page-content-container");

        for (const section of sections) {
            const items = section.select("div.anime-card-container, div.episodes-card-container");
            for (const item of items) {
                list.push(this._parseAnime(item));
            }
        }
        // Use a Set to remove duplicate entries that may appear in multiple sections
        const uniqueList = Array.from(new Set(list.map(a => a.link)))
                                .map(link => list.find(a => a.link === link));

        return {
            list: uniqueList,
            hasNextPage: false
        };
    }

    async getLatestUpdates(page) {
        // Re-using the same logic as getPopular since the homepage contains the latest episodes.
        return this.getPopular(page);
    }


    async search(query, page, filters) {
        // The site's search does not appear to support pagination.
        if (page > 1) return { list: [], hasNextPage: false };
        
        const doc = await this._request(`${this.source.baseUrl}/?search_param=animes&s=${encodeURIComponent(query)}`);
        const list = doc.select("div.row.display-flex > div").map(it => this._parseAnime(it));
        
        return {
            list,
            hasNextPage: false
        };
    }

    async getDetail(url) {
        const doc = await this._request(url);
        const name = doc.selectFirst("h1.anime-details-title").text;
        const imageUrl = doc.selectFirst("div.anime-thumbnail img").getSrc;
        const description = doc.selectFirst("p.anime-story").text;

        const yearText = doc.selectFirst("div.anime-info:contains(بداية العرض)")?.text || "";
        const year = this._getIntFromText(yearText);
        
        const isDubbed = name.includes("مدبلج");

        const chapters = [];
        const episodeElements = doc.select("div#DivEpisodesList div.episode-card-container");
        for (const el of episodeElements) {
            const a = el.selectFirst("h3 a");
            const chapterUrl = a.getHref;
            const chapterName = a.text;
            const episodeNumber = this._getIntFromText(chapterName);
            
            chapters.push({
                name: chapterName,
                url: chapterUrl,
                scanlator: isDubbed ? "Dubbed" : "Subbed",
            });
        }
        
        return {
            name,
            imageUrl,
            description,
            year,
            chapters: chapters.reverse(),
            link: url
        };
    }

    async getVideoList(url) {
        const doc = await this._request(url);
        const streams = [];

        if (this.source.baseUrl.includes("witanime")) {
            const serverLinks = doc.select("ul#episode-servers li a");
            for (const link of serverLinks) {
                const embedUrl = link.attr("data-ep-url");
                streams.push({
                    url: embedUrl,
                    originalUrl: embedUrl,
                    quality: `${link.text.trim()} (WebView)`, // Requires WebView or a dedicated extractor
                });
            }
        } else { // Logic for Anime4up
            const wl_input = doc.selectFirst("input[name=\"wl\"]");
            if (wl_input) {
                const base64_val = wl_input.attr("value");
                const decoded_json_str = this.decodeBase64(base64_val);
                const sources = JSON.parse(decoded_json_str);

                const processSources = (sourceMap, qualityPrefix) => {
                    if (sourceMap) {
                        for (const key in sourceMap) {
                            streams.push({
                                url: sourceMap[key],
                                originalUrl: sourceMap[key],
                                quality: `${qualityPrefix} - ${key} (WebView)`,
                            });
                        }
                    }
                };

                processSources(sources.fhd, "FHD");
                processSources(sources.hd, "HD");
                processSources(sources.sd, "SD");
            }

            const moshahda_input = doc.selectFirst("input[name=\"moshahda\"]");
            if (moshahda_input) {
                const base64_id = moshahda_input.attr("value");
                const moshahda_id = this.decodeBase64(base64_id);
                if (moshahda_id) {
                     const qualityMap = { "Original": "download_o", "720p": "download_x", "480p": "download_h", "360p": "download_n", "240p": "download_l" };
                     for (const quality in qualityMap) {
                        streams.push({
                            url: `https://moshahda.net/${moshahda_id}.html?${qualityMap[quality]}`,
                            originalUrl: `https://moshahda.net/${moshahda_id}.html?${qualityMap[quality]}`,
                            quality: `Moshahda - ${quality}`,
                            headers: { "Referer": "https://moshahda.net/" }
                        });
                    }
                }
            }
        }
        return streams;
    }
}
