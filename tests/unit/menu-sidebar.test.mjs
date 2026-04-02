import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScript } from "./helpers/script-harness.mjs";

test("sidebar yields only while a Leaflet layer control is expanded", () => {
	const env = loadIifeScript("src/menu-sidebar.js");
	const menuSidebar = env.context.EMCDYNMAPPLUS_MENU_SIDEBAR;
	const sidebarHelpers = menuSidebar.createMenuSidebar({
		createElement(tagName, props = {}, children = []) {
			const element = env.document.createElement(tagName);
			if (props.id) element.id = props.id;
			if (props.className) element.className = props.className;
			if (props.text) element.textContent = props.text;
			if (props.attrs) {
				for (const [name, value] of Object.entries(props.attrs)) {
					element.setAttribute(name, value);
				}
			}
			for (const child of children) {
				if (child != null) element.appendChild(child);
			}
			return element;
		},
		addElement(parent, child) {
			parent.appendChild(child);
			return child;
		},
		addLocateMenu() {},
		addMapModeSection() {},
		addPlanningSection() {},
	});

	const sidebar = env.document.createElement("details");

	assert.equal(sidebarHelpers.updateSidebarLayerMenuPriority(sidebar), false);
	assert.equal(sidebar.dataset.leafletLayerMenuActive, undefined);

	const expandedLayerControl = env.document.createElement("div");
	expandedLayerControl.className = "leaflet-control-layers-expanded";
	env.document.__setQuery(".leaflet-control-layers-expanded", expandedLayerControl);

	assert.equal(sidebarHelpers.updateSidebarLayerMenuPriority(sidebar), true);
	assert.equal(sidebar.dataset.leafletLayerMenuActive, "true");

	env.document.__setQuery(".leaflet-control-layers-expanded", null);

	assert.equal(sidebarHelpers.updateSidebarLayerMenuPriority(sidebar), false);
	assert.equal(sidebar.dataset.leafletLayerMenuActive, undefined);
});
