// utils/getRelatedAccessories.js

const getRelatedAccessories = async (
  accessory,
  accessoriesCollection,
  limit = 8,
) => {
  return await accessoriesCollection
    .find({
      status: "active",
      slug: { $ne: accessory.slug },

      $or: [{ category: accessory.category }, { brand: accessory.brand }],

      // optional price similarity (VERY IMPORTANT for ecommerce UX)
      price: {
        $gte: accessory.price * 0.7,
        $lte: accessory.price * 1.3,
      },
    })
    .sort({
      sold: -1,
      rating: -1,
      isFeatured: -1,
      bestSeller: -1,
    })
    .limit(limit)
    .toArray();
};

module.exports = getRelatedAccessories;
