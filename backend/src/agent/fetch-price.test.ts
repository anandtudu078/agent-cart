import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmount,
  priceFromJsonLd,
  priceFromMeta,
  retailerFromUrl,
  titleFromJsonLd,
  titleFromMeta,
} from "./fetch-price.js";
import { isPublicHttpUrl } from "./url-guard.js";

test("parseAmount handles currency formats and rejects junk", () => {
  assert.equal(parseAmount("$1,299.00"), 1299);
  assert.equal(parseAmount("1.299,00"), 1299);
  assert.equal(parseAmount("328"), 328);
  assert.equal(parseAmount(199.5), 199.5);
  assert.equal(parseAmount("free shipping"), null);
  assert.equal(parseAmount(-5), null);
  assert.equal(parseAmount(undefined), null);
});

test("priceFromJsonLd reads Product offers and lowPrice", () => {
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Keyboard",
    offers: { "@type": "Offer", price: "199.00", priceCurrency: "USD" },
  };
  assert.equal(priceFromJsonLd(product), 199);

  const aggregate = {
    "@graph": [
      { "@type": "WebPage" },
      {
        "@type": "Product",
        offers: { "@type": "AggregateOffer", lowPrice: "310", highPrice: 340 },
      },
    ],
  };
  assert.equal(priceFromJsonLd(aggregate), 310);
  assert.equal(priceFromJsonLd({ "@type": "Article" }), null);
});

test("priceFromMeta reads the standard price meta tags", () => {
  const html = `
    <meta property="og:title" content="Keyboard" />
    <meta property="product:price:amount" content="$175.50" />
    <meta name="description" content="1234 not a price" />
  `;
  assert.equal(priceFromMeta(html), 175.5);
  assert.equal(priceFromMeta("<p>nothing here</p>"), null);
});

test("title extraction reads JSON-LD name, then og:title, then <title>", () => {
  assert.equal(titleFromJsonLd({ "@type": "Product", name: "Q1 Pro Keyboard" }), "Q1 Pro Keyboard");
  assert.equal(titleFromJsonLd({ "@type": "Article", name: "Blog post" }), null);
  assert.equal(titleFromMeta('<meta property="og:title" content="WH-1000XM5" />'), "WH-1000XM5");
  assert.equal(titleFromMeta("<title>  Sony WH‑1000XM5 · Amazon </title>"), "Sony WH‑1000XM5 · Amazon");
  assert.equal(titleFromMeta("<p>no title</p>"), null);
});

test("retailerFromUrl maps known hosts and falls back to the label", () => {
  assert.equal(retailerFromUrl("https://www.bestbuy.com/site/tv"), "Best Buy");
  assert.equal(retailerFromUrl("https://smile.amazon.com/dp/B0"), "Amazon");
  assert.equal(retailerFromUrl("https://www.target.com/p/x"), "Target");
  assert.equal(retailerFromUrl("https://shop.example.co.uk/item"), "Shop");
  assert.equal(retailerFromUrl("not-a-url"), "");
});

test("isPublicHttpUrl rejects internal and non-http targets", () => {
  assert.equal(isPublicHttpUrl("https://www.amazon.com/dp/B09"), true);
  assert.equal(isPublicHttpUrl("http://localhost:8000/scan"), false);
  assert.equal(isPublicHttpUrl("http://127.0.0.1/admin"), false);
  assert.equal(isPublicHttpUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isPublicHttpUrl("http://10.0.0.5/hook"), false);
  assert.equal(isPublicHttpUrl("http://192.168.1.1/hook"), false);
  assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
  assert.equal(isPublicHttpUrl("ftp://example.com/x"), false);
  assert.equal(isPublicHttpUrl("not a url"), false);
  assert.equal(isPublicHttpUrl(42), false);
});
