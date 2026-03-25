# Freed
## The feed reader that let's you control what you feed your brain.

### Features:
- **Open-source**
- **Privacy First**: Freed runs entierly in a webpage. It has no "server" storing any data. It all stays in your browser locally. No accounts required, no algorithm, no ads, just you and the information sources you picked.
- **Offline Ready**: As a **PWA (Progressive Web App)**, Freed can be installed on your desktop or mobile device and works offline once your feeds are synced.
- **Secure by Default**: A feed aggregator fetches data from all around the internet and rendering this arbitrary data in a native app is a risky bet. Freed approaches this from a different angle by leveraging your web browser content sandboxing capabilities.
- **Filters and tags**: Freed has a powerful filtering system that gives you infinite flexibility. You want to read articles published in the last 48 hours but only if they are about Sports or Computer Science? It's only three clicks away.
- **Built-in Discover Tab**: Gone are the days of scouring through the internet to find new feeds. Freed ships with a Discover tab with hundreds of feeds!
- **Annotations & Highlighting**
- **Youtube Videos Player**
- **Podcasts Support**
- **Favorites, Discarded and Important articles**
- **Reading progress tracking and resuming**
- **Powerful plugin system**: Freed can be extended in many ways, allowing anyone to make Freed their own. Several official plugins are already available. Installing a plugin is as easy as pasting an url in a box and pressing "Install".
- **Simple**: Freed is built with vanilla Javascript, HTML and CSS.
- **Themable**: Freed offers many builtin themes and fonts you can pick from. If you still want more, check out the Themer plugin below!
- **And a lot more...**


## Getting Started

To use Freed just go to https://malom-ctrl.github.io/Freed/

You can use it directly as a website or you can install it to your device so it behaves more like a native app.

**On desktop**: Click "Install" in your web browser adress bar.

**On mobile**: Click "Add to home screen" in your web browser menu.

## Running your Own Instance

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

## Featured Plugins

The following official plugins are available to install directly from within Freed's settings:
- **Language Learning**: Adds a translation tool to translate words or sentences on the fly aswell as a definition lookup tool.
- **Themer**: Adds a simple menu for you to create custom themes.
- **Automations**: Enables the creation of complex automations based on events and conditions.

If you have created a plugin for Freed and want it featured here, please open an issue.

## Development

Freed is written in **vanilla JavaScript**. It intentionally avoids heavy frameworks like React or Vue to remain lightweight, fast, and dependency-free.

**Contributions are welcome! If you have ideas for new features or improvements, please open an issue or a PR.**
