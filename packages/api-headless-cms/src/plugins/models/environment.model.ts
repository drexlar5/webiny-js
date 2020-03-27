import { validation } from "@webiny/validation";
import {
    compose,
    onSet,
    withFields,
    setOnce,
    skipOnPopulate,
    boolean,
    date,
    string,
    withName,
    withHooks,
    withProps
} from "@webiny/commodo";

export default ({ createBase }) => {
    const CmsEnvironment = compose(
        withName("CmsEnvironment"),
        withFields(instance => ({
            name: string({ validation: validation.create("required") }),
            description: string({ validation: validation.create("maxLength: 500") }),
            slug: setOnce()(string({ validation: validation.create("required") })),
            setAsDefaultOn: skipOnPopulate()(date()),
            default: compose(
                onSet(value => {
                    // Unset previous default environment.
                    if (!instance.default && value) {
                        instance.setAsDefaultOn = new Date();
                        const removeAfterSave = instance.hook("afterSave", async () => {
                            removeAfterSave();
                            // Deactivate previously published revision
                            const previousDefault = await CmsEnvironment.findOne({
                                query: { default: true, id: { $ne: instance.id } }
                            });

                            if (previousDefault) {
                                previousDefault.default = false;
                                await previousDefault.save();
                            }
                        });
                    }
                    return value;
                })
            )(boolean({ value: false }))
        })),
        withProps({
            get url() {
                const slug = this.slug;
                return {
                    manage: `/cms/manage/${slug}`,
                    read: `/cms/read/${slug}`,
                    preview: `/cms/preview/${slug}`
                };
            }
        }),
        withHooks({
            beforeDelete() {
                if (this.default) {
                    throw new Error("Cannot delete the default environment.");
                }
            },
            async beforeCreate() {
                const existingGroup = await CmsEnvironment.count({ query: { slug: this.slug } });
                if (existingGroup > 0) {
                    throw Error(`Environment with slug "${this.slug}" already exists.`);
                }
            }
        })
    )(createBase());

    return CmsEnvironment;
};