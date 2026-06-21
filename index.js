require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
const PDFDocument = require("pdfkit");
const { ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;
const getRelatedAccessories = require("./utils/getRelatedAccessories");
// ===== Middleware =====
app.use(
  cors({
    origin: ["https://smart-phone-auth.web.app"],
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

// ===== Environment Variable Check =====
if (
  !process.env.DB_USER ||
  !process.env.DB_PASS ||
  !process.env.ACCESS_TOKEN_SECRET
) {
  console.log("Required environment variables are missing.");
  process.exit(1);
}

// ===== MongoDB URI =====
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.g29mryf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// ===== MongoDB Client =====
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ===== JWT Token Generator =====
const generateToken = (user) => {
  return jwt.sign(
    {
      email: user.email,
      role: user.role || "user",
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

app.post("/jwt", async (req, res) => {
  try {
    const user = req.body;

    const token = generateToken(user);

    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .status(200)
      .send({
        success: true,
        message: "Login successful",
      });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to generate token",
    });
  }
});
// ===== Verify Token Middleware =====

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized access",
    });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({
        success: false,
        message: "Forbidden access",
      });
    }

    req.decoded = decoded;

    next();
  });
};

const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded.email;

    const user = await usersCollection.findOne({
      email,
    });

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "admin") {
      return res.status(403).send({
        success: false,
        message: "Forbidden access",
      });
    }

    next();
  } catch (error) {
    console.error(error);

    res.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

async function run() {
  try {
    // Collections
    const usersCollection = client.db("smartPhoneShopDB").collection("users");

    const blogsCollection = client.db("smartPhoneShopDB").collection("blogs");

    const phonesCollection = client.db("smartPhoneShopDB").collection("phones");

    const ordersCollection = client.db("smartPhoneShopDB").collection("orders");

    const cartsCollection = client.db("smartPhoneShopDB").collection("carts");

    const flashSalesCollection = client
      .db("smartPhoneShopDB")
      .collection("flashSales");

    const accessoriesCollection = client
      .db("smartPhoneShopDB")
      .collection("accessories");

    // GET: All Users (Safe)
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        if (!user?.email) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

        const existingUser = await usersCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.status(200).json({
            success: true,
            message: "User already exists",
          });
        }

        const newUser = {
          name: user.name || "Unknown",
          email: user.email,
          uid: user.uid,
          photoURL: user.photoURL || "",
          role: user.role || "user",
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);

        res.status(201).json({
          success: true,
          message: "User created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();

        const safeUsers = users.map((u) => ({
          _id: u._id,
          name: u.name,
          email: u.email,
          uid: u.uid,
          photoURL: u.photoURL,
          role: u.role,
          createdAt: u.createdAt,
        }));

        res.status(200).json({
          success: true,
          count: safeUsers.length,
          users: safeUsers,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to fetch users",
          error: error.message,
        });
      }
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        res.status(200).json({
          success: true,
          user,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Error fetching user",
          error: error.message,
        });
      }
    });

    app.get("/users/role/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(200).json({
            success: true,
            role: "user",
          });
        }

        res.status(200).json({
          success: true,
          role: user.role || "user",
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          role: "user",
        });
      }
    });

    app.patch("/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;

        if (!role) {
          return res.status(400).json({
            success: false,
            message: "Role is required",
          });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } },
        );

        res.status(200).json({
          success: true,
          message: "Role updated",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to update role",
          error: error.message,
        });
      }
    });

    //phones apies with pagination
    app.get("/phones", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;

      const skip = (page - 1) * limit;

      const phones = await phonesCollection
        .find()
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await phonesCollection.countDocuments();

      res.send({
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        phones,
      });
    });

    //single phone get api
    app.get("/phones/slug/:slug", async (req, res) => {
      try {
        const slug = req.params.slug;

        // 1. Find main phone
        const phone = await phonesCollection.findOne({ slug });

        if (!phone) {
          return res.status(404).send({
            success: false,
            message: "Phone not found",
          });
        }

        // 2. Find related phones (same brand, exclude current)
        const related = await phonesCollection
          .find({
            brand: phone.brand,
            slug: { $ne: phone.slug },
          })
          .limit(8)
          .toArray();

        res.send({
          success: true,
          phone,
          related, // ✅ NOW IT EXISTS
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Server error",
        });
      }
    });

    //FlashSale api
    app.get("/phones/flash-sale", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;

        const skip = (page - 1) * limit;

        const query = {
          flashSale: true,
          status: "active",
        };

        const flashPhones = await phonesCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await phonesCollection.countDocuments(query);

        res.send({
          success: true,
          total,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          flashSaleProducts: flashPhones,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Server error while fetching flash sale products",
        });
      }
    });

    app.get("/phones/flash-sale/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const product = await phonesCollection.findOne({
          _id: new ObjectId(id),
          flashSale: true,
          status: "active",
        });

        if (!product) {
          return res.status(404).send({
            success: false,
            message: "Product not found",
          });
        }

        // related products
        const related = await phonesCollection
          .find({
            category: product.category,
            flashSale: true,
            status: "active",
            _id: { $ne: product._id },
          })
          .limit(4)
          .toArray();

        res.send({
          success: true,
          product,
          related,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Server error while fetching product",
        });
      }
    });
    //accessories api
    app.get("/accessories", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;

        const skip = (page - 1) * limit;

        const query = { status: "active" };

        const total = await accessoriesCollection.countDocuments(query);

        const accessories = await accessoriesCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 }) // newest first
          .toArray();

        res.send({
          success: true,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          accessories,
        });
      } catch (error) {
        console.error("GET /accessories error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch accessories",
        });
      }
    });

    app.get("/accessories/slug/:slug", async (req, res) => {
      try {
        const slug = req.params.slug;

        // 1. GET SINGLE ACCESSORY
        const accessory = await accessoriesCollection.findOne({
          slug,
          status: "active",
        });

        if (!accessory) {
          return res.status(404).send({
            success: false,
            message: "Accessory not found",
          });
        }

        // 2. GET RELATED ACCESSORIES
        const related = await getRelatedAccessories(
          accessory,
          accessoriesCollection,
          8,
        );

        // 3. RESPONSE
        res.send({
          success: true,
          accessory,
          related,
        });
      } catch (error) {
        console.error("GET /accessories/slug error:", error);

        res.status(500).send({
          success: false,
          message: "Server error",
        });
      }
    });

    // Add To Cart apies

    app.post("/cart", async (req, res) => {
      try {
        const cartItem = req.body;

        const existingProduct = await cartsCollection.findOne({
          userEmail: cartItem.userEmail,
          productId: cartItem.productId,
        });

        // Product already exists
        if (existingProduct) {
          const result = await cartsCollection.updateOne(
            {
              _id: existingProduct._id,
            },
            {
              $inc: {
                quantity: 1,
              },
            },
          );

          return res.send({
            success: true,
            message: "Quantity updated",
            result,
          });
        }

        cartItem.quantity = 1;
        cartItem.createdAt = new Date();

        const result = await cartsCollection.insertOne(cartItem);

        res.send({
          success: true,
          insertedId: result.insertedId,
          message: "Added to cart successfully",
        });
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.get("/cart", async (req, res) => {
      try {
        const result = await cartsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.get("/cart/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const result = await cartsCollection
          .find({
            userEmail: email,
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.patch("/cart/increase/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await cartsCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $inc: {
              quantity: 1,
            },
          },
        );

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.patch("/cart/decrease/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const item = await cartsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (item.quantity <= 1) {
          return res.send({
            success: false,
            message: "Minimum quantity is 1",
          });
        }

        const result = await cartsCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $inc: {
              quantity: -1,
            },
          },
        );

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.delete("/cart/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await cartsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send({
          success: true,
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.delete("/cart/clear/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const result = await cartsCollection.deleteMany({
          userEmail: email,
        });

        res.send({
          success: true,
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.get("/cart-count/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const count = await cartsCollection.countDocuments({
          userEmail: email,
        });

        res.send({
          count,
        });
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.get("/cart-summary/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const cartItems = await cartsCollection
          .find({
            userEmail: email,
          })
          .toArray();

        const subtotal = cartItems.reduce(
          (sum, item) => sum + item.discountPrice * item.quantity,
          0,
        );

        const totalQuantity = cartItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );

        res.send({
          totalItems: totalQuantity,
          subtotal,
        });
      } catch (error) {
        res.status(500).send(error);
      }
    });

    //Orders realted api

    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;

    

        order.status = "pending";
        order.createdAt = new Date();

        const result = await ordersCollection.insertOne(order);

        // OPTIONAL: clear cart after order placed
        await cartsCollection.deleteMany({
          userEmail: order.userEmail,
        });

        res.send({
          success: true,
          message: "Order placed successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Order failed",
          error,
        });
      }
    });
    app.get("/orders", async (req, res) => {
      try {
        const result = await ordersCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });
    app.get("/orders/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const result = await ordersCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });

    app.get("/orders/detail/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await ordersCollection.findOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send(error);
      }
    });
    app.patch("/orders/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
            },
          },
        );

        res.send({
          success: true,
          message: "Order status updated",
          result,
        });
      } catch (error) {
        res.status(500).send(error);
      }
    });
    app.delete("/orders/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await ordersCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send({
          success: true,
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        res.status(500).send(error);
      }
    });
    app.get("/orders-summary", async (req, res) => {
      try {
        const orders = await ordersCollection.find().toArray();

        const totalOrders = orders.length;

        const totalRevenue = orders.reduce(
          (sum, order) => sum + (order.totalPrice || 0),
          0,
        );

        const pending = orders.filter((o) => o.status === "pending").length;

        const delivered = orders.filter((o) => o.status === "delivered").length;

        res.send({
          totalOrders,
          totalRevenue,
          pending,
          delivered,
        });
      } catch (error) {
        res.status(500).send(error);
      }
    });

//   const PDFDocument = require("pdfkit");

app.get("/orders/invoice/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await ordersCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!order) {
      return res.status(404).send({
        success: false,
        message: "Order not found",
      });
    }

    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${id}.pdf`
    );

    doc.pipe(res);

    // =====================================
    // HEADER
    // =====================================
    doc
      .rect(0, 0, 700, 90)
      .fill("#2563eb");

    doc
      .fillColor("white")
      .fontSize(26)
      .text("SMART PHONE SHOP", 50, 30);

    doc
      .fontSize(12)
      .text("Premium Mobile & Accessories Store", 50, 60);

    doc.moveDown(5);

    // =====================================
    // ORDER INFO
    // =====================================
    doc.fillColor("black");

    doc
      .fontSize(16)
      .text(`Invoice No : INV-${order._id}`);

    doc
      .fontSize(12)
      .text(
        `Date : ${new Date(order.createdAt).toLocaleDateString()}`
      );

    doc.text(`Status : ${order.status}`);

    doc.moveDown();

    // =====================================
    // CUSTOMER INFO
    // =====================================
    doc
      .fontSize(16)
      .fillColor("#2563eb")
      .text("Customer Information");

    doc.fillColor("black");

    doc.text(`Email : ${order.userEmail}`);
    doc.text(`Name : ${order.shippingAddress?.name}`);
    doc.text(`Phone : ${order.shippingAddress?.phone}`);

    doc.moveDown();

    // =====================================
    // SHIPPING ADDRESS
    // =====================================
    doc
      .fontSize(16)
      .fillColor("#2563eb")
      .text("Shipping Address");

    doc.fillColor("black");

    doc.text(order.shippingAddress?.address);

    doc.moveDown();

    // =====================================
    // PAYMENT METHOD
    // =====================================
    doc
      .fontSize(16)
      .fillColor("#2563eb")
      .text("Payment Method");

    doc.fillColor("black");

    doc.text(order.paymentMethod.toUpperCase());

    doc.moveDown();

    // =====================================
    // TABLE HEADER
    // =====================================
    let y = doc.y;

    doc
      .rect(50, y, 500, 25)
      .fill("#e5e7eb");

    doc.fillColor("black");

    doc.text("Product", 60, y + 7);
    doc.text("Qty", 300, y + 7);
    doc.text("Price", 370, y + 7);
    doc.text("Total", 470, y + 7);

    y += 35;

    // =====================================
    // PRODUCTS
    // =====================================
    let subtotal = 0;

    order.items.forEach((item) => {
      const lineTotal =
        item.discountPrice * item.quantity;

      subtotal += lineTotal;

      doc.text(item.name, 60, y);
      doc.text(item.quantity.toString(), 300, y);
      doc.text(`BDT ${item.discountPrice}`, 370, y);
      doc.text(`BDT ${lineTotal}`, 470, y);

      y += 30;
    });

    // =====================================
    // TOTALS
    // =====================================
    const shippingCharge = subtotal > 2000 ? 0 : 80;

    const grandTotal = subtotal + shippingCharge;

    y += 20;

    doc
      .fontSize(13)
      .text(`Subtotal : BDT ${subtotal}`, 350, y);

    y += 25;

    doc.text(
      `Shipping Charge : BDT ${shippingCharge}`,
      350,
      y
    );

    y += 30;

    doc
      .fontSize(18)
      .fillColor("#16a34a")
      .text(
        `Grand Total : BDT ${grandTotal}`,
        320,
        y
      );

    // =====================================
    // FOOTER
    // =====================================
    doc.moveDown(5);

    doc
      .fillColor("gray")
      .fontSize(11)
      .text(
        "Thank you for shopping with Smart Phone Shop",
        {
          align: "center",
        }
      );

    doc.text(
      "OmarFaruk@smartphoneshop.com",
      {
        align: "center",
      }
    );

    doc.text(
      "www.smartphoneshop.com",
      {
        align: "center",
      }
    );

    doc.end();
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      message: "Failed to generate invoice",
    });
  }
});

    // Test MongoDB Connection
    await client.db("admin").command({ ping: 1 });

    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.log(error);
  }
}

run().catch(console.dir);

// ===== Root Route =====
app.get("/", (req, res) => {
  res.send("Smart Phone Shop Server Running");
});

// ===== 404 Route =====
app.use((req, res) => {
  res.status(404).send({
    success: false,
    message: "Route Not Found",
  });
});

// ===== Global Error Handler =====
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).send({
    success: false,
    message: "Internal Server Error",
  });
});

// ===== Start Server =====
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
