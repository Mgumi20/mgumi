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
    "version": "1.2.5",
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
    const res = await this.client.get(url, this.getHeaders());
    const doc = new Document(res.body);

    const episodeInput = doc.selectFirst("input#e_id");
    if (!episodeInput) throw new Error("Episode ID not found");
    const episodeId = episodeInput.attr("value");

    // استخراج XSRF-TOKEN من HTML (script[data-csrf] أو input[name=_token])
    let xsrfToken = null;

    const csrfScript = doc.selectFirst('script[data-csrf]');
    if (csrfScript) {
        xsrfToken = csrfScript.attr('data-csrf');
    }

    if (!xsrfToken) {
        const tokenInput = doc.selectFirst('input[name="_token"]');
        if (tokenInput) {
            xsrfToken = tokenInput.attr("value");
        }
    }

    if (!xsrfToken) {
        throw new Error("XSRF token not found in HTML");
    }

    const headers = {
        ...this.getHeaders(url),
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": xsrfToken
    };

    const body = JSON.stringify({ episode_id: episodeId });

    const apiRes = await this.client.post(`${this.source.baseUrl}/player/api`, body, headers);
    const json = JSON.parse(apiRes.body);

    const streamUrl = json.stream_url;
    const domain = json.stream_domains[0];
    const isLegacy = json.legacy !== 0;

    const baseVideoUrl = `${domain}/${streamUrl}`;
    const subtitles = [{
        file: `${baseVideoUrl}/eng.ass`,
        label: "English",
    }];

    const resolutions = ["720", "1080"];
    if (json.resolution === "4k") resolutions.push("2160");

    const videoList = [];

    for (const res of resolutions) {
        let videoPath = "";
        if (isLegacy) {
            videoPath = (res === "720") ? "/x264.720p.mp4" : `/av1.${res}.webm`;
        } else {
            videoPath = `/${res}/manifest.mpd`;
        }

        const videoUrl = baseVideoUrl + videoPath;
        videoList.push({
            url: videoUrl,
            originalUrl: videoUrl,
            quality: `${res}p`,
            headers,
            subtitles,
        });
    }

    const prefQuality = this.getPreference("pref_quality_key") || "1080";
    return videoList.sort((a, b) => {
        if (a.quality.includes(prefQuality)) return -1;
        if (b.quality.includes(prefQuality)) return 1;
        return parseInt(b.quality) - parseInt(a.quality);
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
