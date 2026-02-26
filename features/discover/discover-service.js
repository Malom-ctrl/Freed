import { FeedService } from "../feeds/feed-service.js";
import { DB } from "../../core/db.js";
import { Utils } from "../../core/utils.js";
import { Events } from "../../core/events.js";

export const DiscoverService = {
  addDiscoverPack: async function (pack, allDiscoverFeeds, onComplete) {
    const dataFeedsMap = new Map(allDiscoverFeeds.map((f) => [f.id, f]));
    const feedsToAdd = pack.feeds
      .map((fid) => dataFeedsMap.get(fid))
      .filter(Boolean);

    if (feedsToAdd.length === 0) return;

    Utils.showToast(`Adding ${feedsToAdd.length} feeds...`);

    let addedCount = 0;
    for (const feedData of feedsToAdd) {
      const existing = await DB.getFeed(feedData.url);
      if (existing) continue;

      await FeedService.addFeedDirectly(feedData);
      addedCount++;
    }

    if (addedCount > 0) {
      Utils.showToast(`Pack added (${addedCount} new feeds)`);
      Events.emit(Events.ARTICLES_UPDATED);
    } else {
      Utils.showToast(`All feeds in pack already exist`);
    }

    if (onComplete) onComplete();
  },
};
