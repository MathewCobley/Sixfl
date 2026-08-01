const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath = "src/app/(admin)/admin/kits/page.tsx";

function read() {
  return fs.readFileSync(path.join(root, pagePath), "utf8");
}

function write(source) {
  fs.writeFileSync(path.join(root, pagePath), source, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${pagePath}`);
  }
  return source.replace(before, after);
}

let source = read();

source = replaceOnce(
  source,
  'import KitDesignUploader from "@/components/admin/kits/KitDesignUploader";',
  [
    'import KitDesignUploader from "@/components/admin/kits/KitDesignUploader";',
    'import KitImageLightbox from "@/components/admin/kits/KitImageLightbox";',
  ].join("\n"),
  "kit lightbox import",
);

source = replaceOnce(
  source,
  [
    '                <div className="aspect-square bg-white p-2">',
    '                  <img',
    '                    src={`/api/kits/${design.id}/image?size=thumb&v=${design.updatedAt.getTime()}`}',
    '                    alt={design.name ?? `Kit ${design.code}`}',
    '                    loading="lazy"',
    '                    className="h-full w-full object-contain"',
    '                  />',
    '                </div>',
  ].join("\n"),
  [
    '                <KitImageLightbox',
    '                  src={`/api/kits/${design.id}/image?size=thumb&v=${design.updatedAt.getTime()}`}',
    '                  fullSrc={`/api/kits/${design.id}/image?size=full&v=${design.updatedAt.getTime()}`}',
    '                  alt={design.name ?? `Kit ${design.code}`}',
    '                  className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-white p-2"',
    '                  imageClassName="h-full w-full object-contain"',
    '                />',
  ].join("\n"),
  "catalogue kit thumbnail lightbox",
);

source = replaceOnce(
  source,
  [
    '                          {order.design ? (',
    '                            <img',
    '                              src={`/api/kits/${order.design.id}/image?size=thumb&v=${order.design.updatedAt.getTime()}`}',
    '                              alt={order.design.name ?? order.design.code}',
    '                              className="h-24 w-24 shrink-0 rounded-2xl border border-white/10 bg-white object-contain p-1"',
    '                            />',
    '                          ) : (',
  ].join("\n"),
  [
    '                          {order.design ? (',
    '                            <KitImageLightbox',
    '                              src={`/api/kits/${order.design.id}/image?size=thumb&v=${order.design.updatedAt.getTime()}`}',
    '                              fullSrc={`/api/kits/${order.design.id}/image?size=full&v=${order.design.updatedAt.getTime()}`}',
    '                              alt={order.design.name ?? order.design.code}',
    '                              className="group relative block h-24 w-24 shrink-0 cursor-zoom-in overflow-hidden rounded-2xl border border-white/10 bg-white p-1"',
    '                              imageClassName="h-full w-full object-contain"',
    '                            />',
    '                          ) : (',
  ].join("\n"),
  "order kit thumbnail lightbox",
);

if (!/KitImageLightbox/.test(source) || !/size=full/.test(source)) {
  throw new Error("Kit image lightbox was not added correctly.");
}

write(source);
console.log(
  "Admin kit thumbnails now open a full-screen, full-resolution image preview.",
);
