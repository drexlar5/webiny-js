// @flow
import type { CmsRenderElementStylePluginType } from "webiny-app-cms/types";

const unit = "px";

export default ({
    name: "cms-render-element-style-margin",
    type: "cms-render-element-style",
    renderStyle({ settings, style }: Object) {
        const { margin } = settings;

        if (!margin) {
            return style;
        }

        const adv = margin.advanced;
        const { desktop = {}, mobile = {} } = margin;

        ["top", "right", "bottom", "left"].forEach(side => {
            style[`--desktop-margin-${side}`] = ((adv ? desktop[side] : desktop.all) || 0) + "px";
            style[`--mobile-margin-${side}`] = ((adv ? mobile[side] : mobile.all) || 0) + "px";
        });

        return style;
    }
}: CmsRenderElementStylePluginType);
