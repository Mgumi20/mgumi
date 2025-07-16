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
    "version": "1.1.4",
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

        // جلب البيانات الوصفية (metadata)
        const infoContainer = doc.selectFirst("div.relative > div.justify-between > div");
        const name = infoContainer.selectFirst("div > h1")?.text?.trim() || "No Title";
        const author = infoContainer.selectFirst("div > a:nth-of-type(3)")?.text?.trim();

        let imageUrl = doc.selectFirst("div.float-left > img.object-cover")?.getSrc;
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = this.source.baseUrl + imageUrl;
        }

        const description = doc.selectFirst("div.relative > p.leading-tight")?.text;
        const genres = doc.select("ul.list-none > li > a").map((it) => it.text);
        const status = 1; // 1 = Completed

        // --- FIX START: تطبيق منطق episodeListParse ---
        
        // 1. استخراج تاريخ الرفع
        const dateUploadStr = doc.selectFirst("a:has(i.fa-upload)")?.text?.trim();
        // تحويل التاريخ إلى timestamp أو استخدام التاريخ الحالي كقيمة احتياطية
        const dateUpload = dateUploadStr ? new Date(dateUploadStr).getTime().toString() : Date.now().toString();

        // 2. استخراج رقم الحلقة من الرابط (URL)
        const numMatch = url.match(/-(\d+)\/?$/); // تعبير نمطي (regex) للعثور على الرقم في نهاية الرابط
        const num = numMatch ? numMatch[1] : "1"; // استخدام "1" كقيمة احتياطية

        // 3. بناء اسم الحلقة الديناميكي
        const episodeName = `Episode ${num}`;
        
        // 4. إنشاء قائمة الفصول بالبيانات الصحيحة
        const chapters = [{
            name: episodeName, // استخدام الاسم الديناميكي
            url: url,
            dateUpload: dateUpload // إضافة تاريخ الرفع
        }];

        // --- FIX END ---

        return {
            name,
            author,
            imageUrl,
            description,
            genre: genres,
            status,
            chapters, // استخدام قائمة الفصول المحدثة
            link: url
        };
    }
    
    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const subtitleLinkElement = doc.selectFirst("a[href$=.ass]");
        if (!subtitleLinkElement) {
            throw new Error("Could not find the subtitle download link. The page structure may have changed.");
        }

        const subtitleUrl = subtitleLinkElement.getHref;
        const streamBaseUrl = subtitleUrl.substring(0, subtitleUrl.lastIndexOf('/') + 1);

        const streams = [];
        const resolutions = ["720", "1080", "2160"];

        const subtitles = [{
            file: subtitleUrl,
            label: "English",
        }];

        for (const res of resolutions) {
            const videoUrl = `${streamBaseUrl}${res}/manifest.mpd`;
            streams.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: `${res}p`,
                headers: this.getHeaders(url),
                subtitles: subtitles,
            });
        }
        
        const prefQuality = this.getPreference("pref_quality_key") || "1080";
        const sortedStreams = streams.sort((a, b) => {
            if (a.quality.includes(prefQuality)) return -1;
            if (b.quality.includes(prefQuality)) return 1;
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
