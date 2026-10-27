# Retro Space Canvas

![HTML5](https://img.shields.io/badge/html5-canvas-E34F26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-vanilla-F7DF1E?logo=javascript&logoColor=111)
![Audio](https://img.shields.io/badge/audio-Web%20Audio%20API-7C3AED)
![Install](https://img.shields.io/badge/install-none-success)
![License](https://img.shields.io/badge/license-MIT-blue)

A neon space shooter drawn on one HTML5 canvas. No build step, no libraries, no sound files. Open `index.html` and the game runs.

## Play locally

Double-click `index.html`, or from this folder:

```bash
start index.html
```

The page is a static site. Any browser from the last several years is enough.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow keys or WASD | Hold the left or right side of the screen. The upper and lower edges also steer up and down. |
| Shoot | Hold Space | Any finger on the screen fires while it is down |
| Pause | P | — |
| Mute | M, or the Sound button | Sound button |
| Start / retry | Enter, Space, or Start | Start |

You have three lives. Enemies arrive in waves. Every fifth wave includes a larger elite ship. Clearing a wave adds a bonus. The best score is stored in `localStorage` under `retro-space-canvas-high-score` and survives a reload. If the browser blocks storage for local files, the best score still lasts for that visit.

Shots, hits, explosions, and the wave chime are synthesized with the Web Audio API. The first click or key press starts the audio context, which is what browsers require before sound can play.

## GitHub Pages

Publish this folder as the site root so `index.html` is the homepage.

1. Create a repository and put these files at the root: `index.html`, `style.css`, `game.js`, `README.md`.
2. Push the default branch (`main`).
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then save.
6. Wait for the Pages workflow to finish. The site is at `https://<user>.github.io/<repository>/`.

This collection of projects lives in one parent folder. GitHub Pages serves a single site per repository. To publish the game, use this folder as that repository's root rather than the parent directory.

No Jekyll step is required. If a repository still runs Jekyll and hides files, add an empty `.nojekyll` file next to `index.html`.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page, HUD, start and game-over panel |
| `style.css` | Dark neon layout, scanlines, touch hints |
| `game.js` | Movement, waves, particles, scoring, Web Audio |

## License

Released under the MIT License.
