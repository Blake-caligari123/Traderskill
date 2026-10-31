# Duneglass — moving sand art store

A fast, animated, single-page dropshipping storefront for a round moving-sand picture.
Plain HTML/CSS/JS, so there's no build step. The hero is a live sand simulation that visitors can flip.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .        # or: python3 -m http.server
```

## Project layout

| File | What it does |
| --- | --- |
| `index.html` | All page sections and copy |
| `css/styles.css` | Styles, animations, responsive layout |
| `js/sand.js` | `SandSim`: the falling-sand simulation drawn on a canvas |
| `js/main.js` | Store config, product options, cart, scroll animations |

## Conversion features built in

- Announcement bar with the offer (free-shipping threshold, bundle discount, guarantee)
- Interactive hero: visitors flip the frame and watch sand fall
- Quantity-break bundles (1 / 2 save 15% / 3 save 20%) with "Most popular" and "Best value" anchors
- Live colourway preview that also recolours the hero
- Sticky add-to-cart bar once the hero scrolls away
- Cart drawer with a free-shipping progress bar and a next-tier upsell
- Trust signals next to the buy button: guarantee, shipping time, damage replacement, payment methods
- Comparison table, guarantee section and an FAQ that answers common objections
- Email capture with a first-order discount

## Before you launch: checklist

1. **Checkout.** Set `CONFIG.checkoutUrl` in `js/main.js` (Shopify, Stripe Payment Links, etc.).
   For a full store, move this design into a Shopify theme or a headless Shopify/Stripe cart so orders, tax and fulfilment are handled for you.
2. **Prices and shipping.** Edit `SIZES`, `CONFIG.freeShippingThreshold`, `CONFIG.shippingFee` and `CONFIG.tiers`
   to match your supplier cost. Aim for at least a 3× markup so you can afford paid ads.
3. **Check product claims against your supplier.** Sizes, what's in the box, materials and the
   processing and delivery times in the FAQ are placeholders. Make them match what your supplier actually ships.
4. **Newsletter.** Set `CONFIG.newsletterEndpoint` (Klaviyo, Mailchimp, etc.) and create the 10% code.
5. **Real photos and video.** Add your own (or properly licensed) product shots and a short video of
   the sand falling. Don't reuse Amazon or other sellers' images.
6. **Reviews.** Add a reviews app (Judge.me, Loox, Okendo) once you have **real** customer reviews.
   Don't publish made-up reviews, fake "was" prices, fake countdown timers or fake low-stock warnings.
   The ACCC enforces this under Australian Consumer Law, and it gets ad accounts banned.
7. **Legal pages.** Fill in the privacy policy, terms and refund policy linked in the footer, plus your
   contact email (currently `hello@example.com`).
8. **Tracking.** Add the Meta Pixel, TikTok Pixel and GA4 tags. Buttons that matter carry `data-track` attributes.
9. **Brand.** "Duneglass" is a placeholder. Check that the name and domain are free and not trademarked before you use them.
