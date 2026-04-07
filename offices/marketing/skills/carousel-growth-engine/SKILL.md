---
name: carousel-growth-engine
description: Campaign publication and delivery. Use when packaging approved campaigns for delivery (ZIP generation) or publishing via Instagram API.
---

# Carousel Growth Engine

## Delivery options
1. ZIP package: images + copy + metadata JSON + publishing instructions
2. Instagram Graph API: direct publication (requires API credentials)

## Package structure
```
campaign-{name}-{date}/
├── images/
│   ├── slide-01.png
│   └── ...
├── copy.md (caption, hashtags)
├── metadata.json (format, timing, audience)
└── instructions.md (posting checklist)
```
