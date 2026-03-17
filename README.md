# Freed
## The feed reader that let's you control what you feed your brain.

### Features:
- **Open-source**
- **Privacy First**: Freed runs entierly in a webpage. It has no "server" storing any data. It all stays in your browser locally. No accounts required, no algorithm, no ads, just you and the information sources you picked.
- **Offline Ready**: As a **PWA (Progressive Web App)**, Freed can be installed on your desktop or mobile device and works offline once your feeds are synced.
- **Secure by Default**: A feed aggregator fetches data from all around the internet and rendering this arbitrary data in a native app is a risky bet. Freed aapproaches this from a different angle by leveraging your web browser content sandboxing capabilities.
- **Filters and tags**: Freed has a powerful filtering system that gives you infinite flexibility. You want to read the article published in the last 48 hours but only if they are about Sports or Computer Science ? It's only three clicks away.
- **Built-in Discover Tab**: Gone are the days of scouring through the internet to find new feeds, Freed ships with a Discover tab with hundreds of feeds!
- **Annotations & Highlighting**
- **Youtube Videos Player**
- **Podcasts Support**
- **Favorites, Discarded and Important articles**
- **Reading progress tracking and resuming**
- **Powerful plugin system**: Freed can be extended in many ways, allowing anyone to make Freed their own. Several official plugins are already available. Installing a plugin is as easy as pasting an url in a box and pressing "Install".
- **Simple**: Freed is built with Vanilla Javascript, HTML and CSS.
- **Themable**: Freed offers many builtin themes and fonts you can pick from. If you still want more, check out the Themer plugin below!
- **And a lot more...**


## Getting Started

To use Freed just go to https://malom-ctrl.github.io/Freed/

You can use it directly as a website or you can install it to your device if you want it to behaves more like a native app.
**On desktop**: Click on the "Install" button in the adress bar.
**On mobile**: In your browser menu, click on "Add to home screen"

## Running your own instance

_Only do this if you have an actual reason to, if you are not sure, then you probably shouldn't._

Freed is a static web application. It requires no backend, making it trivial to host or run locally.
You can run Freed locally by simply cloning the repository and serving it with any static file server:
~~~bash
git clone https://github.com/Malom-ctrl/Freed.git
cd freed/
# Example using python's built-in server
python3 -m http.server 8080
~~~
Then open `http://localhost:8080` in your browser.

## Featured plugins

The following official plugins are available to install directly from within Freed's settings:
- **Language Learning**: Adds a translation tool to your reader to translate words or sentences on the fly. Also adds a definition lookup tool.
- **Themer**: Create custom themes.
- **Automations**: Create complex automations based on events and conditions.

If you have created a plugin for Freed and want it featured here, please open an issue.

## Development

Freed is written in **Vanilla JavaScript**. It intentionally avoids heavy frameworks like React or Vue to remain lightweight, fast, and dependency-free.

**Contributions are welcome! If you have ideas for new features or improvements, please open an issue or a PR.**
