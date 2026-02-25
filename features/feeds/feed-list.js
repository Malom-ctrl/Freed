import { Utils } from "../../core/utils.js";
import DOMPurify from "dompurify";

export const FeedList = {
  render: function (feeds, currentFeedId, onSwitch, onEdit, onStats) {
    const { hexToRgba } = Utils;
    const container = document.getElementById("feed-list-container");
    if (!container) return;
    container.innerHTML = "";

    feeds.forEach((feed) => {
      const div = document.createElement("div");
      const isActive = currentFeedId === feed.id;
      div.className = `nav-item ${isActive ? "active" : ""}`;

      // Use displayColor for rendering logic
      const activeColor = feed.displayColor;

      // Apply dynamic active color if present
      if (isActive && activeColor) {
        div.style.color = activeColor;
        div.style.backgroundColor = hexToRgba(activeColor, 0.1);
      }

      const strokeColor = activeColor ? activeColor : "currentColor";

      const contentDiv = document.createElement("div");
      contentDiv.className = "nav-item-content";
      contentDiv.style.display = "flex";
      contentDiv.style.alignItems = "center";
      contentDiv.style.gap = "12px";
      contentDiv.style.flex = "1";
      contentDiv.style.overflow = "hidden";

      if (feed.iconData) {
        const img = document.createElement("img");
        img.src = DOMPurify.sanitize(feed.iconData);
        img.style.width = "20px";
        img.style.height = "20px";
        img.style.borderRadius = "2px";
        img.style.objectFit = "contain";
        contentDiv.appendChild(img);
      } else if (feed.type === "web") {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", strokeColor);
        svg.setAttribute("stroke-width", "2");

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "12");
        circle.setAttribute("cy", "12");
        circle.setAttribute("r", "10");

        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", "2");
        line.setAttribute("y1", "12");
        line.setAttribute("x2", "22");
        line.setAttribute("y2", "12");

        const path = document.createElementNS(svgNS, "path");
        path.setAttribute(
          "d",
          "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z",
        );

        svg.appendChild(circle);
        svg.appendChild(line);
        svg.appendChild(path);
        contentDiv.appendChild(svg);
      } else {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", strokeColor);
        svg.setAttribute("stroke-width", "2");

        const path1 = document.createElementNS(svgNS, "path");
        path1.setAttribute("d", "M4 11a9 9 0 0 1 9 9");

        const path2 = document.createElementNS(svgNS, "path");
        path2.setAttribute("d", "M4 4a16 16 0 0 1 16 16");

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "5");
        circle.setAttribute("cy", "19");
        circle.setAttribute("r", "1");

        svg.appendChild(path1);
        svg.appendChild(path2);
        svg.appendChild(circle);
        contentDiv.appendChild(svg);
      }

      const titleSpan = document.createElement("span");
      titleSpan.className = "feed-title-text";
      titleSpan.style.whiteSpace = "nowrap";
      titleSpan.style.overflow = "hidden";
      titleSpan.style.textOverflow = "ellipsis";
      titleSpan.textContent = feed.title;
      contentDiv.appendChild(titleSpan);

      const actionsDiv = document.createElement("div");
      actionsDiv.style.display = "flex";
      actionsDiv.style.gap = "2px";

      const statsBtn = document.createElement("div");
      statsBtn.className = "feed-btn-icon feed-stats-btn";
      statsBtn.title = "Stats";
      const statsSvgNS = "http://www.w3.org/2000/svg";
      const statsSvg = document.createElementNS(statsSvgNS, "svg");
      statsSvg.setAttribute("width", "16");
      statsSvg.setAttribute("height", "16");
      statsSvg.setAttribute("viewBox", "0 0 24 24");
      statsSvg.setAttribute("fill", "none");
      statsSvg.setAttribute("stroke", "currentColor");
      statsSvg.setAttribute("stroke-width", "2");
      statsSvg.setAttribute("stroke-linecap", "round");
      statsSvg.setAttribute("stroke-linejoin", "round");
      const sLine1 = document.createElementNS(statsSvgNS, "line");
      sLine1.setAttribute("x1", "18");
      sLine1.setAttribute("y1", "20");
      sLine1.setAttribute("x2", "18");
      sLine1.setAttribute("y2", "10");
      const sLine2 = document.createElementNS(statsSvgNS, "line");
      sLine2.setAttribute("x1", "12");
      sLine2.setAttribute("y1", "20");
      sLine2.setAttribute("x2", "12");
      sLine2.setAttribute("y2", "4");
      const sLine3 = document.createElementNS(statsSvgNS, "line");
      sLine3.setAttribute("x1", "6");
      sLine3.setAttribute("y1", "20");
      sLine3.setAttribute("x2", "6");
      sLine3.setAttribute("y2", "14");
      statsSvg.appendChild(sLine1);
      statsSvg.appendChild(sLine2);
      statsSvg.appendChild(sLine3);
      statsBtn.appendChild(statsSvg);

      const settingsBtn = document.createElement("div");
      settingsBtn.className = "feed-btn-icon feed-settings-btn";
      settingsBtn.title = "Edit Feed";
      const setSvg = document.createElementNS(statsSvgNS, "svg");
      setSvg.setAttribute("width", "16");
      setSvg.setAttribute("height", "16");
      setSvg.setAttribute("viewBox", "0 0 24 24");
      setSvg.setAttribute("fill", "none");
      setSvg.setAttribute("stroke", "currentColor");
      setSvg.setAttribute("stroke-width", "2");
      setSvg.setAttribute("stroke-linecap", "round");
      setSvg.setAttribute("stroke-linejoin", "round");
      const setCircle = document.createElementNS(statsSvgNS, "circle");
      setCircle.setAttribute("cx", "12");
      setCircle.setAttribute("cy", "12");
      setCircle.setAttribute("r", "3");
      const setPath = document.createElementNS(statsSvgNS, "path");
      setPath.setAttribute(
        "d",
        "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 0 2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
      );
      setSvg.appendChild(setCircle);
      setSvg.appendChild(setPath);
      settingsBtn.appendChild(setSvg);

      actionsDiv.appendChild(statsBtn);
      actionsDiv.appendChild(settingsBtn);

      div.appendChild(contentDiv);
      div.appendChild(actionsDiv);

      // Handle main click on the entire row
      div.onclick = (e) => {
        onSwitch(feed.id);
      };

      // Handle stats click
      statsBtn.onclick = (e) => {
        e.stopPropagation();
        onStats(feed);
      };

      // Handle edit click
      settingsBtn.onclick = (e) => {
        e.stopPropagation();
        onEdit(feed);
      };

      container.appendChild(div);
    });

    // Update active states for static items
    const allBtn = document.querySelector('[data-id="all"]');
    if (allBtn) {
      if (currentFeedId === "all") allBtn.classList.add("active");
      else allBtn.classList.remove("active");
    }
    const discBtn = document.querySelector('[data-id="discover"]');
    if (discBtn) {
      if (currentFeedId === "discover") discBtn.classList.add("active");
      else discBtn.classList.remove("active");
    }
  },
};
