// --- START OF FILE anime4up.js ---

const mangayomiSources = [
  {
    "name": "Anime4Up",
    "lang": "ar",
    "id": 402283993, // Using ID from previous conversion for consistency
    "baseUrl": "https://anime4up.rest",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=anime4up.rest",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.1",
    "pkgPath": "anime/src/ar/anime4up.js",
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

  getBaseUrl() {
    return this.getPreference("baseUrl_override") || this.source.baseUrl;
  }

  getHeaders() {
    return {
      Referer: this.getBaseUrl() + "/",
    };
  }

  async getDocument(slug) {
    const url = this.getBaseUrl() + slug;
    const res = await this.client.get(url, this.getHeaders());
    return new Document(res.body);
  }

  parseAnimeListPage(doc) {
    const list = [];
    const items = doc.select("div.anime-list-content div.anime-card-poster > div.hover");

    for (const item of items) {
      const img = item.selectFirst("img");
      const linkElement = item.selectFirst("a");
      if (img && linkElement) {
        const name = img.attr("alt");
        const imageUrl = img.getSrc;
        const link = linkElement.getHref;
        list.push({ name, imageUrl, link });
      }
    }

    const hasNextPage = doc.selectFirst("ul.pagination > li > a.next") !== null;
    return { list, hasNextPage };
  }

  async getPopular(page) {
    const doc = await this.getDocument(`/anime-list-3/page/${page}/`);
    return this.parseAnimeListPage(doc);
  }

  async getLatestUpdates(page) {
    throw new Error("Not supported");
  }

  async search(query, page, filters) {
    if (query) {
      const url = page > 1 ? `/page/${page}/?s=${query}&search_param=animes` : `/?search_param=animes&s=${query}`;
      const doc = await this.getDocument(url);
      const searchSelector = "div.row.display-flex > div"; // More specific selector for search from CS3
      const list = [];
       doc.select(searchSelector).forEach(item => {
           const linkEl = item.selectFirst("a");
           const imgEl = item.selectFirst("img");
           if(linkEl && imgEl) {
               list.push({
                   name: imgEl.attr("alt"),
                   link: linkEl.getHref,
                   imageUrl: imgEl.getSrc,
               });
           }
       });
       const hasNextPage = doc.selectFirst("ul.pagination > li > a.next") !== null;
       return { list, hasNextPage };
    }

    // Filters logic
    let genre = "";
    let type = "";
    let status = "";
    
    const genreFilter = filters.find(f => f.type_name === 'GroupFilter');
    if (genreFilter) {
        const selectedGenre = genreFilter.state.find(s => s.state);
        if (selectedGenre) genre = selectedGenre.value;
    }

    const typeFilter = filters.find(f => f.name === 'Type');
    if (typeFilter) {
        type = typeFilter.values[typeFilter.state].value;
    }
    
    const statusFilter = filters.find(f => f.name === 'Status');
    if (statusFilter) {
        status = statusFilter.values[statusFilter.state].value;
    }

    let url;
    if (genre) {
      url = `/anime-genre/${genre}/page/${page}/`;
    } else if (type) {
      url = `/anime-type/${type}/page/${page}/`;
    } else if (status) {
      url = `/anime-status/${status}/page/${page}/`;
    } else {
      throw new Error("اختر فلتر (Select a filter)");
    }

    const doc = await this.getDocument(url);
    return this.parseAnimeListPage(doc);
  }

  statusCode(status) {
    status = status.toLowerCase();
    if (status.includes("يعرض الان")) return 0; // Ongoing
    if (status.includes("مكتمل")) return 1; // Completed
    return 5; // Unknown
  }

  async getDetail(url) {
    const doc = await this.getDocument(url.replace(this.getBaseUrl(), ""));

    const name = doc.selectFirst("h1.anime-details-title").text;
    const imageUrl = doc.selectFirst("img.thumbnail").getSrc;

    let description = "";
    doc.select("div.anime-info").forEach(info => {
      description += info.text + "\n";
    });
    const story = doc.selectFirst("p.anime-story")?.text;
    if (story) {
      description += "\n" + story;
    }

    let status = 5;
    const statusElement = doc.select("div.anime-info:contains(حالة الأنمي)");
    if (statusElement.length > 0) {
      status = this.statusCode(statusElement[0].text);
    }
    
    const genre = [];
    doc.select("ul.anime-genres > li > a, div.anime-info > a").forEach(g => genre.push(g.text));

    const chapters = [];
    const episodeSelector = "div.ehover6 > div.episodes-card-title > h3 > a, ul.all-episodes-list li > a";
    const episodeElements = doc.select(episodeSelector);
    for (const el of episodeElements) {
      chapters.push({
        name: el.text,
        url: el.getHref,
      });
    }
    chapters.reverse();

    return { name, imageUrl, description, genre, status, chapters, link: url };
  }
  
  // Handles Base64 decoding
  decodeBase64(str) {
    try {
      return atob(str);
    } catch (e) {
      console.error("Base64 decode error:", e);
      return "[]"; 
    }
  }

  async getVideoList(url) {
    const doc = await this.getDocument(url.replace(this.getBaseUrl(), ""));
    const streams = [];

    // --- Server Extraction ---
    const fhd_b64 = doc.selectFirst("form input[name='watch_fhd']")?.attr("value") || "";
    const hd_b64 = doc.selectFirst("form input[name='watch_hd']")?.attr("value") || "";
    const sd_b64 = doc.selectFirst("form input[name='watch_SD']")?.attr("value") || "";

    const fhd_servers = JSON.parse(this.decodeBase64(fhd_b64));
    const hd_servers = JSON.parse(this.decodeBase64(hd_b64));
    const sd_servers = JSON.parse(this.decodeBase64(sd_b64));

    const allServers = [...(fhd_servers || []), ...(hd_servers || []), ...(sd_servers || [])];
    const uniqueLinks = [...new Set(allServers.map(server => server.link))];

    // --- Moshahda Download Links ---
    const moshahda_b64 = doc.selectFirst("input[name='moshahda']")?.attr("value");
    if(moshahda_b64){
        const moshahdaID = this.decodeBase64(moshahda_b64);
        const qualities = {
            "Original": "download_o", "720p": "download_x",
            "480p": "download_h", "360p": "download_n", "240p": "download_l"
        };
        for (const quality in qualities) {
            streams.push({
                url: `https://moshahda.net/${moshahdaID}.html?${qualities[quality]}`,
                originalUrl: `https://moshahda.net/${moshahdaID}.html?${qualities[quality]}`,
                quality: `Moshahda ${quality} [Download]`,
                // Note: These are direct download links, not streaming URLs.
                // An additional step might be needed to make them streamable.
            });
        }
    }
    
    // --- IMPORTANT NOTE ---
    // The Kotlin extension uses many complex, third-party extractor libraries.
    // These are not available in Mangayomi. To make this source fully functional,
    // each extractor would need to be implemented in JavaScript.
    console.log("Found server links that require extractors:", uniqueLinks);
    
    // You can add simple direct links if they exist, but most will require extraction.
    if(streams.length === 0){
        throw new Error("Video extractors not implemented for this source's streaming servers. Only Moshahda download links were found (if any).");
    }

    // Sort by user preference
    const qualityPref = this.getPreference("preferred_quality");
    return streams.sort((a, b) => {
        const aHasQuality = a.quality.includes(qualityPref);
        const bHasQuality = b.quality.includes(qualityPref);
        return bHasQuality - aHasQuality;
    });
  }

  getFilterList() {
    return [
      {
        "type_name": "GroupFilter",
        "name": "Genre",
        "state": [
          {"type_name": "CheckBox", "name": "أكشن", "value": "action", "state": false},
          {"type_name": "CheckBox", "name": "مغامرات", "value": "adventure", "state": false},
          {"type_name": "CheckBox", "name": "سيارات", "value": "cars", "state": false},
          {"type_name": "CheckBox", "name": "كوميدي", "value": "comedy", "state": false},
          {"type_name": "CheckBox", "name": "شياطين", "value": "demons", "state": false},
          {"type_name": "CheckBox", "name": "دراما", "value": "drama", "state": false},
          {"type_name": "CheckBox", "name": "ايتشي", "value": "ecchi", "state": false},
          {"type_name": "CheckBox", "name": "خيالي", "value": "fantasy", "state": false},
          {"type_name": "CheckBox", "name": "ألعاب", "value": "game", "state": false},
          {"type_name": "CheckBox", "name": "حريم", "value": "harem", "state": false},
          {"type_name": "CheckBox", "name": "تاريخي", "value": "historical", "state": false},
          {"type_name": "CheckBox", "name": "رعب", "value": "horror", "state": false},
          {"type_name": "CheckBox", "name": "جوسي", "value": "josei", "state": false},
          {"type_name": "CheckBox", "name": "أطفال", "value": "kids", "state": false},
          {"type_name": "CheckBox", "name": "سحر", "value": "magic", "state": false},
          {"type_name": "CheckBox", "name": "فنون قتالية", "value": "martial-arts", "state": false},
          {"type_name": "CheckBox", "name": "ميكا", "value": "mecha", "state": false},
          {"type_name": "CheckBox", "name": "عسكري", "value": "military", "state": false},
          {"type_name": "CheckBox", "name": "موسيقى", "value": "music", "state": false},
          {"type_name": "CheckBox", "name": "غموض", "value": "mystery", "state": false},
          {"type_name": "CheckBox", "name": "محاكاة ساخرة", "value": "parody", "state": false},
          {"type_name": "CheckBox", "name": "شرطة", "value": "police", "state": false},
          {"type_name": "CheckBox", "name": "نفسي", "value": "psychological", "state": false},
          {"type_name": "CheckBox", "name": "رومانسي", "value": "romance", "state": false},
          {"type_name": "CheckBox", "name": "ساموراي", "value": "samurai", "state": false},
          {"type_name": "CheckBox", "name": "مدرسي", "value": "school", "state": false},
          {"type_name": "CheckBox", "name": "خيال علمي", "value": "sci-fi", "state": false},
          {"type_name": "CheckBox", "name": "سينين", "value": "seinen", "state": false},
          {"type_name": "CheckBox", "name": "شوجو", "value": "shoujo", "state": false},
          {"type_name": "CheckBox", "name": "شوجو اي", "value": "shoujo-ai", "state": false},
          {"type_name": "CheckBox", "name": "شونين", "value": "shounen", "state": false},
          {"type_name": "CheckBox", "name": "شونين اي", "value": "shounen-ai", "state": false},
          {"type_name": "CheckBox", "name": "شريحة من الحياة", "value": "slice-of-life", "state": false},
          {"type_name": "CheckBox", "name": "فضاء", "value": "space", "state": false},
          {"type_name": "CheckBox", "name": "رياضة", "value": "sports", "state": false},
          {"type_name": "CheckBox", "name": "قوى خارقة", "value": "super-power", "state": false},
          {"type_name": "CheckBox", "name": "خارق للطبيعة", "value": "supernatural", "state": false},
          {"type_name": "CheckBox", "name": "اثارة", "value": "thriller", "state": false},
          {"type_name": "CheckBox", "name": "مصاصي دماء", "value": "vampire", "state": false}
        ]
      },
      {
        "type_name": "SelectFilter",
        "name": "Type",
        "state": 0,
        "values": [
          {"type_name": "SelectOption", "name": "Any", "value": ""},
          {"type_name": "SelectOption", "name": "TV", "value": "tv"},
          {"type_name": "SelectOption", "name": "Movie", "value": "movie"},
          {"type_name": "SelectOption", "name": "OVA", "value": "ova"},
          {"type_name": "SelectOption", "name": "ONA", "value": "ona"},
          {"type_name": "SelectOption", "name": "Special", "value": "special"},
          {"type_name": "SelectOption", "name": "Music", "value": "music"}
        ]
      },
      {
        "type_name": "SelectFilter",
        "name": "Status",
        "state": 0,
        "values": [
          {"type_name": "SelectOption", "name": "Any", "value": ""},
          {"type_name": "SelectOption", "name": "مكتمل", "value": "completed"},
          {"type_name": "SelectOption", "name": "يعرض حاليا", "value": "ongoing"}
        ]
      }
    ];
  }

  getSourcePreferences() {
    return [
      {
        key: "baseUrl_override",
        editTextPreference: {
          title: "Override Base URL",
          summary: "For when the domain changes. Default: https://anime4up.rest",
          value: "https://anime4up.rest",
          dialogTitle: "Override Base URL",
          dialogMessage: "",
        },
      },
      {
        key: "preferred_quality",
        listPreference: {
          title: "Preferred quality",
          summary: "Select the quality to be prioritized",
          valueIndex: 0,
          entries: ["1080p", "720p", "480p", "360p", "Moshahda"],
          entryValues: ["1080p", "720p", "480p", "360p", "Moshahda"],
        },
      },
    ];
  }
}

// --- END OF FILE anime4up.js ---
