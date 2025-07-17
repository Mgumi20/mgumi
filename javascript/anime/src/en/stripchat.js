const mangayomiSources = [{
    "name": "Stripchat",
    "id": 987654573,
    "baseUrl": "https://stripchat.com",
    "lang": "en",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=stripchat.com",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": true,
    "sourceCodeUrl": "",
    "apiUrl": "",
    "version": "1.0.2",
    "isManga": false,
    "itemType": 1,
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "notes": "",
    "pkgPath": "anime/src/en/stripchat.js"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
    this.excludeIdsMap = {};
  }

  getPreference(key) {
    return new SharedPreferences().get(key);
  }

  getHeaders(isApi = false, referer = this.source.baseUrl) {
    const headers = {
      "Referer": referer,
      "Origin": this.source.baseUrl,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    };
    if (isApi) {
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json, text/plain, */*";
    } else {
      headers["Accept"] =
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
    }
    return headers;
  }

  async fetchCategory(page, category, sortBy) {
    if (page === 1) {
      this.excludeIdsMap[category] = [];
    }

    const payload = {
      favoriteIds: [],
      limit: 60,
      offset: (page - 1) * 60,
      primaryTag: category,
      sortBy: sortBy,
      userRole: "guest",
      improveTs: false,
      excludeModelIds: this.excludeIdsMap[category] || [],
      isRecommendationDisabled: false,
    };

    const res = await this.client.post(
      this.source.apiUrl,
      this.getHeaders(true),
      payload
    );

    const data = JSON.parse(res.body);
    const newIds = [];
    const list = data.models.map((model) => {
      newIds.push(parseInt(model.id));
      return {
        name: model.username,
        link: `${this.source.baseUrl}/${model.username}`,
        imageUrl: model.previewUrlThumbSmall,
      };
    });

    if (!this.excludeIdsMap[category]) {
      this.excludeIdsMap[category] = [];
    }
    this.excludeIdsMap[category].push(...newIds);

    return { list, hasNextPage: true }; // API provides continuous scroll, so always true
  }

  async getPopular(page) {
    const category = this.getPreference("stripchat_popular_category") || "girls";
    return await this.fetchCategory(page, category, "viewersRating");
  }

  async getLatestUpdates(page) {
    const category = this.getPreference("stripchat_latest_category") || "girls";
    return await this.fetchCategory(page, category, "new");
  }

  async search(query, page, filters) {
    // Search is not paginated on the site, so we ignore the page parameter.
    if (page > 1) return { list: [], hasNextPage: false };

    const url = `${this.source.baseUrl}/search/models/${query}`;
    const res = await this.client.get(url, this.getHeaders(false, url));
    const doc = new Document(res.body);

    const list = doc.select(".model-list-item").map((it) => {
      const title = it.selectFirst(".model-list-item-username").text;
      const href = this.source.baseUrl + it.selectFirst(".model-list-item-link").getHref;
      const posterUrl = it.selectFirst(".image-background")?.getSrc;
      return {
        name: title,
        link: href,
        imageUrl: posterUrl,
      };
    });

    return { list, hasNextPage: false };
  }

  async getDetail(url) {
    const res = await this.client.get(url, this.getHeaders(false, url));
    const doc = new Document(res.body);

    const name =
      doc.selectFirst("meta[property='og:title']")?.attr("content")
        ?.replace(" on Stripchat", "")
        ?.trim() || "";
    const imageUrl =
      doc.selectFirst("meta[property='og:image']")?.attr("content") || "";
    const description =
      doc.selectFirst("meta[property='og:description']")?.attr("content")
        ?.trim() || "";

    const chapters = [
      {
        name: "Live Stream",
        url: url, // Pass the same URL to getVideoList
      },
    ];

    return {
      name,
      link: url,
      imageUrl,
      description,
      chapters,
    };
  }

  unescapeUnicode(str) {
    // This regex finds all \uXXXX sequences and replaces them with the corresponding character.
    return str.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
      return String.fromCharCode(parseInt(grp, 16));
    });
  }

  async getVideoList(url) {
    const res = await this.client.get(url, this.getHeaders(false, url));
    const doc = new Document(res.body);

    const scriptElement = doc
      .select("script")
      .find((el) => el.text.includes("window.__PRELOADED_STATE__"));

    if (!scriptElement) {
      throw new Error("Could not find stream data.");
    }

    const scriptContent = this.unescapeUnicode(scriptElement.text);
    const jsonString = scriptContent.substring(
      scriptContent.indexOf("{"),
      scriptContent.lastIndexOf("}") + 1
    );

    const state = JSON.parse(jsonString);
    const modelData = state?.model?.data || state?.modelData;

    if (!modelData) {
      throw new Error("Could not parse model data from page.");
    }

    const streamName = modelData.streamName;
    const streamHost = modelData.hlsStreamHost;
    const hlsUrlTemplate = modelData.hlsStreamUrlTemplate;

    if (!streamName || !streamHost || !hlsUrlTemplate) {
      throw new Error("Required stream information not found.");
    }

    const m3u8Url = hlsUrlTemplate
      .replace("{cdnHost}", streamHost)
      .replace("{streamName}", streamName)
      .replace("{suffix}", "_auto");

    return [
      {
        url: m3u8Url,
        originalUrl: m3u8Url,
        quality: "Live",
        headers: {
          Referer: this.source.baseUrl,
        },
      },
    ];
  }

  getSourcePreferences() {
    return [
      {
        key: "stripchat_popular_category",
        listPreference: {
          title: "Popular Category",
          summary: "Select the category to show in the Popular tab",
          valueIndex: 0,
          entries: ["Girls", "Couples", "Men", "Trans"],
          entryValues: ["girls", "couples", "men", "trans"],
        },
      },
      {
        key: "stripchat_latest_category",
        listPreference: {
          title: "Latest (New Models) Category",
          summary: "Select the category to show in the Latest tab",
          valueIndex: 0,
          entries: ["Girls", "Couples", "Men", "Trans"],
          entryValues: ["girls", "couples", "men", "trans"],
        },
      },
    ];
  }
}
