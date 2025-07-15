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
    "version": "1.0.5",
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

    getHeaders(referer = this.source.baseUrl) {
        return {
            "Referer": referer,
            "Origin": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        };
    }

    async _parseApiResponse(url) {
        const res = await this.client.get(url, this.getHeaders());
        const data = JSON.parse(res.body);
        const list = [];
        for (const room of data.rooms) {
            list.push({
                name: room.username,
                link: `${this.source.baseUrl}/${room.username}/`,
                imageUrl: room.img
            });
        }
        return {
            list,
            hasNextPage: list.length > 0
        };
    }

    async getPopular(page) {
        const offset = page > 1 ? 90 * (page - 1) : 0;
        const url = `${this.source.baseUrl}/api/ts/roomlist/room-list/?limit=90&offset=${offset}`;
        return await this._parseApiResponse(url);
    }

    async getLatestUpdates(page) {
        const offset = page > 1 ? 90 * (page - 1) : 0;
        const url = `${this.source.baseUrl}/api/ts/roomlist/room-list/?limit=90&offset=${offset}`;
        return await this._parseApiResponse(url);
    }

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

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst("meta[property=og:title]")?.attr("content")?.replace("| PornHoarder.tv", "").trim() || "Unknown";
        const imageUrl = doc.selectFirst("meta[property='og:image']")?.attr("content");
        const description = doc.selectFirst("meta[property=og:description]")?.attr("content")?.trim();
        
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

    // FIX: تم إصلاح الدالة بالكامل لتطابق منطق Kotlin
    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        
        const scripts = doc.select("script");
        let targetScript = null;
        for (const script of scripts) {
            if (script.data.includes("window.initialRoomDossier")) {
                targetScript = script.data;
                break;
            }
        }

        if (!targetScript) {
            throw new Error("Could not find initialRoomDossier script.");
        }

        const jsonString = targetScript.split('window.initialRoomDossier = "')[1]?.split('";')[0];
        if (!jsonString) {
            throw new Error("Could not extract room dossier JSON.");
        }
        
        const unescapedJson = this._unescapeUnicode(jsonString);
        
        // استخدام نفس التعبير النمطي من Kotlin لاستخراج الجزء الأساسي من الرابط
        const m3u8Match = unescapedJson.match(/"hls_source":\s*"(.*)\.m3u8"/);
        const m3u8Base = m3u8Match ? m3u8Match[1] : null;
        
        if (!m3u8Base) {
            throw new Error("Could not find M3U8 stream URL.");
        }
        
        // إعادة بناء الرابط النهائي بنفس طريقة Kotlin
        const finalM3u8Url = m3u8Base + ".m3u8";

        return [{
            url: finalM3u8Url,
            originalUrl: finalM3u8Url,
            quality: "Live",
            isM3U8: true,
            // استخدام ترويسة بسيطة كما هو مقترح في الشيفرة المرجعية
            headers: {
                "Referer": this.source.baseUrl
            }
        }];
    }

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
    
    getSourcePreferences() {
        return [];
    }
}
