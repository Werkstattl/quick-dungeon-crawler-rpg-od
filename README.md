<div align="center">
<img alt="Logo" src="./assets/icon/logo.webp" height="150px" ></img>
</div>

# Quick Dungeon Crawler on Demand

Quick Dungeon Crawler on Demand is an open-source endless dungeon crawler with randomized floors, enemies and items. It's based on the [source code of Dungeon crawler on Demand](https://github.com/redpangilinan/dungeon-crawler-rpg-od), by [Redpangilinan](https://github.com/redpangilinan).

<div align="center">
  <img alt="In game screenshot" src="./assets/screenshots/exploring.webp" width="600" />
</div>

The game is available for Android and Desktop platforms. You can find official releases of the game on:

[![Get it on Google Play](https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png)](https://play.google.com/store/apps/details?id=com.thomaspeissl.quick_dungeon_crawler_od.twa)

[![Play on itch.io](https://img.shields.io/badge/Play%20on-itch.io-red?logo=itch-io)](https://werkstattl.itch.io/quick-dungeon-crawler-on-demand)

[![Play in Browser](https://img.shields.io/badge/Play%20in-Browser-blue?logo=google-chrome&logoColor=white)](https://dungeon.werkstattl.com/)

If you like this game, please consider [supporting me on GitHub Sponsors](https://github.com/sponsors/7underlines)!

Issue reports of all kinds (bug reports, feature requests, etc.) are welcome.

## Playing Locally

To try the latest version from source you only need a small HTTP server. You can use
`npx serve` or Python's built-in web server:

```bash
npx serve
# or
python3 -m http.server
# or
php -S 127.0.0.1:4000
```

After running the server, open your browser at the shown address to play locally. This
ensures the service worker can cache files correctly for offline play.

## Docker

Alternatively, you can run the game using Docker:

```bash
docker build -t quick-dungeon-crawler .
docker run --rm -p 8080:80 quick-dungeon-crawler
```

Open <http://localhost:8080> in your browser after starting the container.

## Contributing

Contributions are very welcome! Feel free to open issues and pull requests.
Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).


## Community

- [Official Subreddit](https://www.reddit.com/r/QuickDungeonCrawler/)

## Credits

This game began as a fork after the original developer announced they would no longer continue development and were open to someone else taking over.

- [Red Pangilinan](https://github.com/redpangilinan) - Original Creator
- [Aekashics](https://aekashics.itch.io/) - Monster Sprites
- [Leohpaz](https://leohpaz.itch.io/) - RPG SFX
- [phoenix1291](https://phoenix1291.itch.io/sound-effects-pack-2) - Level up SFX
- [Leviathan_Music](https://soundcloud.com/leviathan254) - Battle Music
- [Sara Garrard](https://sonatina.itch.io/letsadventure) - Dungeon Music
