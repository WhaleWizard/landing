// Сгенерировано scripts/optimize-article-images.js — не править руками.
// Исходный адрес картинки статьи → готовые WebP-варианты в /images/articles/.
export type ArticleImageManifestEntry = {
  id: string;
  width: number;
  height: number;
  widths: number[];
};

export const ARTICLE_IMAGE_MANIFEST: Readonly<Record<string, ArticleImageManifestEntry>> = {
  "https://i.ibb.co/1fxZ1Gcy/Chat-GPT-Image-2-2026-03-10-58.png": { id: "6dd8bf42b6a6", width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  "https://i.ibb.co/4RFDKz81/Chat-GPT-Image-2-2026-03-03-48.png": { id: "2cf0a95a5d10", width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  "https://i.ibb.co/5WSmvwqJ/Chat-GPT-Image-2-2026-03-14-07.png": { id: "8acdb36da21a", width: 1731, height: 909, widths: [480, 768, 1200, 1600] },
  "https://i.ibb.co/8gCxfGy5/Chat-GPT-Image-2-2026-03-05-40.png": { id: "af400aff6f06", width: 1730, height: 909, widths: [480, 768, 1200, 1600] },
  "https://i.ibb.co/FkpfqLpc/Chat-GPT-Image-2-2026-03-19-37.png": { id: "719badff95f8", width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  "https://i.ibb.co/LLs68Kw/Chat-GPT-Image-2-2026-03-15-35.png": { id: "347e53fc6fae", width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  "https://i.ibb.co/LzGHHyyp/Chat-GPT-Image-27-2026-01-52-37.png": { id: "7d33f7a9da54", width: 1672, height: 941, widths: [480, 768, 1200, 1600] },
  "https://i.ibb.co/k2NJwSWS/Chat-GPT-Image-2-2026-03-09-33.png": { id: "8b33de0a8214", width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  "https://i.ibb.co/pjj9JxQp/Chat-GPT-Image-2-2026-03-22-45.png": { id: "931e6ececa3f", width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  "https://i.ibb.co/rf3XNgbS/Chat-GPT-Image-2-2026-03-18-34.png": { id: "e2750dff8e52", width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  "https://i.ibb.co/tMy43bt4/Chat-GPT-Image-2-2026-03-12-38.png": { id: "c3454a30cdfc", width: 1536, height: 1024, widths: [480, 768, 1200, 1536] },
  "https://i.ibb.co/wFzmyc0b/image-2026-04-26-19-53-15.png": { id: "7baf433278fa", width: 1868, height: 834, widths: [480, 768, 1200, 1600] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-25/1785008772551-d48051e0-e351-4a86-8677-b9bdfe3b76a3-255c5ea4-cf1d-5e11-a4e0-9938bba63865.jpg": { id: "d34dd74a911e", width: 1280, height: 1280, widths: [480, 768, 1200, 1280] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-25/1785009198528-6d94ad61-df06-4e0f-9482-0ae8772581b2-84e3b91e-b1fb-5365-8d02-3193ebe70391.png": { id: "b627e907ca6c", width: 1366, height: 768, widths: [480, 768, 1200, 1366] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-25/1785009387319-85192959-9389-4885-8489-43df8bbefd48-789d605b-4bce-517a-8761-e445fba9a777.png": { id: "1eef5bb5f2fc", width: 1366, height: 768, widths: [480, 768, 1200, 1366] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-25/1785010352534-fb11a72c-dd61-4a51-b01b-48f383ed6187-49bd5f3a-95f4-5083-b1c4-96c060d52038.jpg": { id: "31c65cd2376c", width: 1280, height: 854, widths: [480, 768, 1200, 1280] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-25/1785011135829-ee10c5f5-1b6f-4f12-bcad-e44cf8ee1422-d427e4ef-3a50-5a80-bcf2-df87bbfb6531.jpg": { id: "05e09fefc63e", width: 1278, height: 1278, widths: [480, 768, 1200, 1278] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785091387600-b0f7212e-577f-434b-970f-7ff0369e0e92-d36e03db-cd05-564f-848a-ff9ee622e3b1.jpg": { id: "8bad308f909e", width: 2880, height: 2880, widths: [480, 768, 1200, 1600] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785091979620-7c250cb7-8e99-47d1-b68f-9be44b1d6c2b-2d1d0463-fc1d-5943-8eb8-567322883c91.jpg": { id: "cabf24ae47c5", width: 2386, height: 713, widths: [480, 768, 1200, 1600] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785091980018-3931c841-781d-4b16-988e-fb9361a34686-6a4a87b1-2bab-5f68-b118-1970017c1441.jpg": { id: "7a58ce72ce53", width: 2404, height: 710, widths: [480, 768, 1200, 1600] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785091980377-e448ec73-2ead-4843-9835-5349ff344c68-4067fa24-0c86-52b9-a844-cd0fd73b5812.jpg": { id: "ef478887dee1", width: 2379, height: 883, widths: [480, 768, 1200, 1600] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785092087022-eefa276e-9ce6-4ee4-9b98-9cbcfef06802-ace1619a-812a-501a-b56d-5010861d8b43.png": { id: "a46862183522", width: 2545, height: 993, widths: [480, 768, 1200, 1600] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785092087438-e3b92d4e-4dcc-4552-8f3b-212a6ff86d0b-cfbe50d3-5de8-5b74-a05f-128c856792dc.png": { id: "b83d559df4db", width: 838, height: 518, widths: [480, 768, 838] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785092429567-c48da70f-cfe9-4ca6-a391-fbbc4e72753c-32ad9848-c236-51e7-980f-4b59a431d688.jpg": { id: "0777aeb60a24", width: 676, height: 899, widths: [480, 676] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785092482481-a2974abb-4f21-4ef5-aa0e-c7412f94614f-2104d160-9d4e-55db-aef2-774ca797a561.jpg": { id: "17146bb96163", width: 2880, height: 2880, widths: [480, 768, 1200, 1600] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785092816055-f86417a2-f836-47f8-bb40-1a58112f578c-4f608486-f41e-5022-be02-fe49cf731706.jpg": { id: "66abf8627dd3", width: 1278, height: 1278, widths: [480, 768, 1200, 1278] },
  "https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev/uploads/2026-07-26/1785092918820-664c4817-3690-4f42-9ebc-d72b291f5a41-bff66797-ed1b-58cb-bbd0-67896e903e79.png": { id: "4087dc99de37", width: 1518, height: 972, widths: [480, 768, 1200, 1518] },
};
