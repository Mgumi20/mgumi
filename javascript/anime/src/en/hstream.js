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
    "version": "1.2.3",
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

        // استخدام محددات أكثر دقة بناءً على مثال Kotlin
        const infoContainer = doc.selectFirst("div.relative > div.justify-between > div");

        const name = infoContainer.selectFirst("div > h1")?.text?.trim() || "No Title";
        const author = infoContainer.selectFirst("div > a:nth-of-type(3)")?.text?.trim(); // جلب اسم الفنان

        // استخدام المحدد الصحيح للصورة والتأكد من أن الرابط كامل
        let imageUrl = doc.selectFirst("div.float-left > img.object-cover")?.getSrc;
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = this.source.baseUrl + imageUrl;
        }

        const description = doc.selectFirst("div.relative > p.leading-tight")?.text;
        const genres = doc.select("ul.list-none > li > a").map(it => it.text);

        // تحديد الحالة بشكل ثابت كما في مثال Kotlin
        const status = 1; // 1 = Completed

        // هذا المصدر يعرض فيديو واحد، لذلك ننشئ "فصل" واحد لتشغيله
        const chapters = [{
            name: "Watch",
            url: url
        }];

        return {
            name,
            author,      // تمت إضافة الفنان
            imageUrl,    // تم تحديث محدد الصورة
            description, // تم تحديث محدد الوصف
            genre: genres,
            status,      // تمت إضافة الحالة
            chapters,
            link: url
        };
    }
    
async getVideoList(url) {
    // Fetch episode page and parse
    const res = await this.client.get(url, this.getHeaders());
    const doc = new Document(res.body);

    // 1. Get cookie XSRF-TOKEN
    const xsrfCookie = this.client.cookieJar.cookies.find(c => c.name === "XSRF-TOKEN");
    const xsrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : null;

    // 2. Get episode ID from HTML
    const episodeId = doc.selectFirst("input#e_id")?.attr("value");
    if (!xsrfToken || !episodeId) {
        throw new Error("Missing XSRF token or episode ID");
    }

    // 3. Prepare new headers for POST
    const newHeaders = {
        ...this.getHeaders(url),
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": xsrfToken,
    };

    // 4. Prepare and send POST to /player/api
    const body = JSON.stringify({ episode_id: episodeId });
    const apiRes = await this.client.post(
        `${this.source.baseUrl}/player/api`,
        body,
        {
            ...newHeaders,
            "Content-Type": "application/json"
        }
    );
    // Assume apiRes.body is JSON
    const data = JSON.parse(apiRes.body);

    // 5. Build base stream URL
    const urlBase = `${data.stream_domains[Math.floor(Math.random() * data.stream_domains.length)]}/${data.stream_url}`;
    const subtitleList = [{
        file: `${urlBase}/eng.ass`,
        label: "English"
    }];

    // 6. Build resolutions list
    const resolutions = ["720", "1080"];
    if (data.resolution === "4k") resolutions.push("2160");

    // 7. Helper for legacy/regular URLs
    function getVideoUrlPath(isLegacy, resolution) {
        if (isLegacy) {
            if (resolution === "720") return "/x264.720p.mp4";
            else return `/av1.${resolution}.webm`;
        } else {
            return `/${resolution}/manifest.mpd`;
        }
    }

    // 8. Build stream objects
    return resolutions.map(resolution => {
        const videoUrl = urlBase + getVideoUrlPath(data.legacy !== 0, resolution);
        return {
            url: videoUrl,
            originalUrl: videoUrl,
            quality: `${resolution}p [${videoUrl}]`,
            headers: newHeaders,
            subtitles: subtitleList
        };
    });
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
