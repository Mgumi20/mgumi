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
  getHeaders(url) {
    return {
      Referer: url,
      Origin: url,
    };
  }

  getPreference(key) {
    return new SharedPreferences().get(key);
  }

  async request(slug) {
    const baseUrl = this.source.baseUrl;
    const url = `${baseUrl}${slug}`;
    const res = await new Client().get(url, this.getHeaders(baseUrl));
    return new Document(res.body);
  }

  async getList(slug) {
    const body = await this.request(slug);
    const list = [];
    const items = body.select("div.items-center div.w-full > a");
    items.forEach((element) => {
      const link = element.getAttr("href");
      const title = element.selectFirst("img").getAttr("alt");
      const episode = link.split("-").pop().split("/")[0];
      const thumbnail_url = `${this.source.baseUrl}/images${link.substring(0, link.lastIndexOf("-"))}/cover-ep-${episode}.webp`;
      list.push({ name: title, link, imageUrl: thumbnail_url });
    });
    const hasNextPage = body.select("span[aria-current] + a").length > 0;
    return { list, hasNextPage };
  }

  async getPopular(page) {
    return await this.getList(`/search?order=view-count&page=${page}`);
  }

  async getLatestUpdates(page) {
    return await this.getList(`/search?order=recently-uploaded&page=${page}`);
  }

  async search(query, page, filters) {
    const url = new URL(`${this.source.baseUrl}/search`);
    url.searchParams.append("s", query);
    url.searchParams.append("page", page);
    url.searchParams.append("order", "view-count");
    return await this.getList(url.pathname + "?" + url.searchParams.toString());
  }

  async getDetail(url) {
    const body = await this.request(url);
    const title = body.selectFirst("div.relative h1").text;
    const imageUrl = body.selectFirst("div.float-left img").getAttr("src");
    const description = body.selectFirst("div.relative p.leading-tight")?.text ?? "";
    const genre = body.select("ul.list-none > li > a").map((g) => g.text).join(", ");

    const episodeNumber = url.split("-").pop().split("/")[0];
    const chapters = [
      {
        name: `Episode ${episodeNumber}`,
        url: url,
        dateUpload: Date.now().toString(),
      },
    ];

    return {
      name: title,
      imageUrl,
      description,
      link: this.source.baseUrl + url,
      genre,
      chapters,
    };
  }

  async getVideoList(url) {
    const response = await new Client().get(`${this.source.baseUrl}${url}`);
    const doc = new Document(response.body);

    const tokenCookie = response.headers["set-cookie"]?.find((c) => c.includes("XSRF-TOKEN"));
    const token = decodeURIComponent(tokenCookie?.split("=")[1].split(";")[0]);
    const episodeId = doc.selectFirst("input#e_id").getAttr("value");

    const body = JSON.stringify({ episode_id: episodeId });
    const headers = {
      Referer: `${this.source.baseUrl}${url}`,
      Origin: this.source.baseUrl,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-XSRF-TOKEN": token,
    };

    const apiResponse = await new Client().post(
      `${this.source.baseUrl}/player/api`,
      headers,
      body
    );

    const json = JSON.parse(apiResponse.body);
    const base = `${json.stream_domains[0]}/${json.stream_url}`;

    const resolutions = ["720", "1080"];
    if (json.resolution === "4k") resolutions.push("2160");

    const legacy = json.legacy !== 0;
    const videos = resolutions.map((res) => {
      let streamUrl;
      if (legacy) {
        streamUrl = base + (res === "720" ? "/x264.720p.mp4" : `/av1.${res}.webm`);
      } else {
        streamUrl = `${base}/${res}/manifest.mpd`;
      }
      return {
        url: streamUrl,
        originalUrl: streamUrl,
        quality: `${res}p`,
        headers,
        subtitles: [{ file: `${base}/eng.ass`, label: "English" }],
      };
    });

    const pref = this.getPreference("hstream_video_resolution") || "720p";
    return videos.sort((a, b) => b.quality.includes(pref) - a.quality.includes(pref));
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
          summary: "Choose default streaming quality",
          valueIndex: 0,
          entries: ["720p (HD)", "1080p (Full HD)", "2160p (4K)", "Auto"],
          entryValues: ["720p", "1080p", "2160p", "auto"],
        },
      },
    ];
  }
}
