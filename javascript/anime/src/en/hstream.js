const mangayomiSources = [
  {
    name: "Hstream",
    id: 987654321,
    lang: "en",
    baseUrl: "https://hstream.moe",
    apiUrl: "",
    iconUrl:
      "https://www.google.com/s2/favicons?sz=128&domain=https://hstream.moe",
    typeSource: "single",
    itemType: 1,
    version: "1.0.0",
    pkgPath: "anime/src/en/hstream.js",
  },
];

class DefaultExtension extends MProvider {
  getHeaders(url) {
    return {
      Referer: url,
      Origin: "https://hstream.moe",
      "User-Agent": "Mozilla/5.0",
    };
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

  async getList(slug) {
    const res = await new Client().get(`${this.source.baseUrl}${slug}`, this.getHeaders(this.source.baseUrl));
    const doc = new Document(res.body);
    const items = doc.select("div.items-center div.w-full > a");
    const list = [];

    for (let el of items) {
      const href = el.getAttribute("href");
      const title = el.selectFirst("img").getAttribute("alt");
      const episode = href.split("-").pop().split("/")[0];
      const imageUrl = `${this.source.baseUrl}/images${href.split("-").slice(0, -1).join("-")}/cover-ep-${episode}.webp`;

      list.push({
        name: title,
        link: href,
        imageUrl,
      });
    }

    const hasNextPage = doc.selectFirst("span[aria-current] + a") !== null;
    return { list, hasNextPage };
  }

  async getDetail(url) {
    const res = await new Client().get(`${this.source.baseUrl}${url}`, this.getHeaders(this.source.baseUrl));
    const doc = new Document(res.body);
    const floatleft = doc.selectFirst("div.relative > div.justify-between > div");

    const title = floatleft.selectFirst("div > h1").text;
    const imageUrl = doc.selectFirst("div.float-left > img").getAttribute("src");
    const description = doc.selectFirst("div.relative > p.leading-tight")?.text || "";
    const genre = doc.select("ul.list-none > li > a").map((a) => a.text.trim());

    const episodeNumber = url.split("-").pop().split("/")[0];
    const dateUpload = Date.now();
    const chapters = [
      {
        name: `Episode ${episodeNumber}`,
        url: url,
        dateUpload: `${dateUpload}`,
      },
    ];

    return {
      name: title,
      imageUrl,
      description,
      genre,
      link: url,
      chapters,
    };
  }

  async getVideoList(url) {
    const res = await new Client().get(`${this.source.baseUrl}${url}`, this.getHeaders(this.source.baseUrl));
    const doc = new Document(res.body);

    const token = res.headers["set-cookie"].find((c) => c.startsWith("XSRF-TOKEN")).split("=")[1].split(";")[0];
    const episodeId = doc.selectFirst("input#e_id").getAttribute("value");

    const headers = {
      Referer: `${this.source.baseUrl}${url}`,
      Origin: this.source.baseUrl,
      "X-Requested-With": "XMLHttpRequest",
      "X-XSRF-TOKEN": decodeURIComponent(token),
      "Content-Type": "application/json",
    };

    const body = JSON.stringify({ episode_id: episodeId });
    const apiRes = await new Client().post(`${this.source.baseUrl}/player/api`, headers, body);
    const json = JSON.parse(apiRes.body);

    const base = `${json.stream_domains[0]}/${json.stream_url}`;
    const resolutions = ["720", "1080"];
    if (json.resolution === "4k") resolutions.push("2160");

    const subtitles = [{ file: `${base}/eng.ass`, label: "English" }];

    const streams = resolutions.map((res) => {
      const legacy = json.legacy !== 0;
      const videoUrl = legacy
        ? res === "720"
          ? `${base}/x264.720p.mp4`
          : `${base}/av1.${res}.webm`
        : `${base}/${res}/manifest.mpd`;
      return {
        url: videoUrl,
        originalUrl: videoUrl,
        quality: `${res}p`,
        subtitles,
      };
    });

    return streams;
  }

  getSourcePreferences() {
    return [
      {
        key: "hstream_pref_video_quality",
        listPreference: {
          title: "Preferred video quality",
          summary: "",
          valueIndex: 0,
          entries: ["720p", "1080p", "2160p (4K)"],
          entryValues: ["720", "1080", "2160"],
        },
      },
    ];
  }
}
