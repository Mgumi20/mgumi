// ==UserScript==
// @name         Hstream for Mangayomi
// @namespace    mangayomi-source
// @version      1.0.0
// @description  Extension to use Hstream (https://hstream.moe) in Mangayomi
// @author       Adapted by ChatGPT
// ==/UserScript==

const mangayomiSources = [
  {
    name: "Hstream",
    id: 883654321,
    lang: "all",
    baseUrl: "https://hstream.moe",
    apiUrl: "",
    iconUrl: "https://www.google.com/s2/favicons?sz=64&domain=https://hstream.moe",
    typeSource: "multi",
    itemType: 1,
    version: "1.0.0",
    pkgPath: "anime/src/all/hstream.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getPreference(key) {
    return new SharedPreferences().get(key);
  }

  getHeaders() {
    return {
      Referer: this.source.baseUrl,
      Origin: this.source.baseUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6832.64 Safari/537.36",
    };
  }

  async request(url) {
    const res = await this.client.get(url, { headers: this.getHeaders() });
    return res.body;
  }

  async getList(slug) {
    const html = await this.request(this.source.baseUrl + slug);
    const doc = new Document(html);
    const elements = doc.select("div.items-center div.w-full > a");

    const list = elements.map((el) => {
      const url = el.getAttr("href");
      const title = el.selectFirst("img").getAttr("alt");
      const episode = url.split("-").pop().split("/")[0];
      const imageUrl = `${this.source.baseUrl}/images${url.substring(0, url.lastIndexOf("-"))}/cover-ep-${episode}.webp`;
      return { name: title, link: url, imageUrl };
    });

    const hasNextPage = doc.select("span[aria-current] + a").length > 0;
    return { list, hasNextPage };
  }

  async getPopular(page) {
    return await this.getList(`/search?order=view-count&page=${page}`);
  }

  async getLatestUpdates(page) {
    return await this.getList(`/search?order=recently-uploaded&page=${page}`);
  }

  async search(query, page, filters) {
    return await this.getList(`/search?s=${query}&page=${page}`);
  }

  async getDetail(url) {
    const html = await this.request(this.source.baseUrl + url);
    const doc = new Document(html);

    const title = doc.selectFirst("div.relative h1").text;
    const imageUrl = doc.selectFirst("div.float-left img").getAttr("src");
    const description = doc.selectFirst("div.relative p.leading-tight")?.text ?? "";
    const genre = doc.select("ul.list-none > li > a").map((g) => g.text).join(", ");
    const episodeNumber = url.split("-").pop().split("/")[0];

    const chapters = [
      {
        name: `Episode ${episodeNumber}`,
        url: url,
        dateUpload: Date.now().toString(),
      },
    ];

    return { name: title, imageUrl, link: this.source.baseUrl + url, description, genre: [genre], status: 1, chapters };
  }

  async getVideoList(url) {
    const html = await this.request(this.source.baseUrl + url);
    const doc = new Document(html);

    const token = doc.html().match(/XSRF-TOKEN=([^;]+)/)?.[1];
    const episodeId = doc.selectFirst("input#e_id").getAttr("value");
    const headers = this.getHeaders();
    headers["Content-Type"] = "application/json";
    headers["X-Requested-With"] = "XMLHttpRequest";
    headers["X-XSRF-TOKEN"] = decodeURIComponent(token);

    const body = JSON.stringify({ episode_id: episodeId });
    const res = await this.client.post(`${this.source.baseUrl}/player/api`, headers, body);
    const data = JSON.parse(res.body);

    const base = `${data.stream_domains[0]}/${data.stream_url}`;
    const resolutions = ["720", "1080"];
    if (data.resolution === "4k") resolutions.push("2160");

    const legacy = data.legacy !== 0;
    const streams = resolutions.map((res) => {
      const url = legacy ?
        (res === "720" ? `${base}/x264.720p.mp4` : `${base}/av1.${res}.webm`) :
        `${base}/${res}/manifest.mpd`;
      return {
        url,
        originalUrl: url,
        quality: `${res}p`,
        headers,
        subtitles: [{ file: `${base}/eng.ass`, label: "English" }],
      };
    });

    const pref = this.getPreference("hstream_video_resolution") || "720p";
    return streams.sort((a, b) => b.quality.includes(pref) - a.quality.includes(pref));
  }

  get supportsLatest() {
    return true;
  }

  getSourcePreferences() {
    return [
      {
        key: "hstream_video_resolution",
        listPreference: {
          title: "Preferred video resolution",
          summary: "",
          valueIndex: 0,
          entries: ["Auto", "720p", "1080p", "2160p"],
          entryValues: ["Auto", "720p", "1080p", "2160p"],
        },
      },
    ];
  }
}
