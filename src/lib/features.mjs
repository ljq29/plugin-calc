export const featureEnabled = (options, name) => !options.features || options.features[name] !== false;

export const requireFeature = (options, name, label) => {
    if (!featureEnabled(options, name)) {
        throw new Error(label + "已在设置中禁用");
    }
};
