import { FeedList } from "./components/FeedList.js";
import { ArticleList } from "./components/ArticleList.js";
import { DiscoverView } from "./components/DiscoverView.js";
import { Modals } from "./components/Modals.js";
import { Navbar } from "./components/Navbar.js";
import { Sidebar } from "./components/Sidebar.js";
import { ReaderView } from "./components/ReaderView.js";

export const UI = {
  renderFeedList: FeedList.render,
  renderArticles: ArticleList.render,
  renderDiscoverView: DiscoverView.render,
  toggleModal: Modals.toggleModal,
  renderStatsModal: Modals.renderStatsModal,
  renderPluginSettings: Modals.renderPluginSettings,
  renderPluginsList: Modals.renderPluginsList,
  renderNavbarActions: Navbar.renderActions,
  renderPluginSidebarItems: Sidebar.renderPrimaryItems,
  renderPluginSidebarSecondaryItems: Sidebar.renderSecondaryItems,
  renderReaderPlugins: ReaderView.renderPlugins,

  showTooltip: Modals.showTooltip,
  hideTooltip: Modals.hideTooltip,
  setupGlobalTooltip: Modals.setupGlobalTooltip,
};
