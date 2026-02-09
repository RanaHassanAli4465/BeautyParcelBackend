const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const Order = require('./models/orderSchema');

const usermodel = require('./models/usermodel');
const Product = require('./models/productSchema');

require('./config/mongooseconnection');

const JWT_SECRET = "pui_pui_poo"; 
app.set('view engine', 'ejs');

// ⭐ CORS: Credentials ko true rakhna lazmi hai cookies ke liye
app.use(cors({
    origin: 'https://beauty-parcel.vercel.app/', 
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let tempUsers = {};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ranahassanali.4465@gmail.com', 
        pass: 'gfhq hows bdnh vhtn' 
    }
});

// Middleware: Check if logged in
const isLoggedIn = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        if (req.xhr || req.path.startsWith('/api/')) {
            return res.status(401).json({ loggedIn: false });
        }
        return res.redirect('/login');
    }
    try {
        const data = jwt.verify(token, JWT_SECRET);
        req.user = data;
        next();
    } catch (err) {
        res.clearCookie("token");
        return res.redirect('/login');
    }
};

// Middleware: Redirect if already logged in
const redirectIfLoggedIn = (req, res, next) => {
    const token = req.cookies.token;
    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return res.redirect('https://beauty-parcel.vercel.app/?alreadyLoggedIn=true');
        } catch (err) {
            res.clearCookie("token");
            next();
        }
    } else {
        next();
    }
};

// --- ROUTES ---

// ⭐ API for React to check login status
app.get('/api/check-auth', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.json({ loggedIn: false });
    try {
        jwt.verify(token, JWT_SECRET);
        res.json({ loggedIn: true });
    } catch (err) {
        res.json({ loggedIn: false });
    }
});

app.post('/acc-login', async (req, res) => {
    let { email, pass } = req.body;
    let user = await usermodel.findOne({ email });
    if (!user) return res.send("Username or Password is wrong!");

    const isMatch = await bcrypt.compare(pass, user.password);
    if (isMatch) {
        const token = jwt.sign({ email, userid: user._id }, JWT_SECRET);
        res.cookie("token", token, { 
            httpOnly: true, 
            secure: false, 
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 
        });
        res.redirect('https://beauty-parcel.vercel.app/');
    } else {
        res.send("Username Or Password is Wrong!");
    }
});

app.post('/acc-signup', async (req, res) => {
    let { email, pass } = req.body;
    let existingUser = await usermodel.findOne({ email });
    if (existingUser) return res.redirect("/login");
    const otp = Math.floor(100000 + Math.random() * 900000);
    tempUsers[email] = { pass, otp };
    const mailOptions = {
        from: 'Beauty Parcel <ranahassan.4465@gmail.com>',
        to: email,
        subject: 'Verify Your Account',
        text: `Your OTP is: ${otp}`
    };
    transporter.sendMail(mailOptions, (err) => {
        if (err) return res.status(500).send("Email failed!");
        res.render("verify-otp", { email });
    });
});

app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    const userData = tempUsers[email];
    if (userData && userData.otp == otp) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userData.pass, salt);
        let user = await usermodel.create({ email, password: hashedPassword });
        const token = jwt.sign({ email, userid: user._id }, JWT_SECRET);
        res.cookie("token", token, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 });
        delete tempUsers[email];
        res.redirect('https://beauty-parcel.vercel.app/'); 
    } else { res.send("Wrong OTP!"); }
});

app.get('/logout', (req, res) => {
    res.clearCookie("token");
    res.redirect('https://beauty-parcel.vercel.app/');
});
app.get('/api/product/default', async (req, res) => {
    try {
        let product = await Product.findOne(); 
        if (!product) {
            // Agar DB khali hai to temporary product bana lo
            
        }
        res.status(200).json({ product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/login', redirectIfLoggedIn, (req, res) => res.render('login'));
app.get('/signup', redirectIfLoggedIn, (req, res) => res.render('signup'));
app.post('/api/place-order', async (req, res) => {
    const { name, address, phone, items, totalBill } = req.body;

    try {
        // 1. Token se email nikaalna (Sabse important step)
        const token = req.cookies.token;
        let userEmail = "Guest"; // Default agar token na mile
        
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            userEmail = decoded.email; // Token se email mil gayi
        }

        // 2. Database mein save (userEmail ke saath)
        const newOrder = await Order.create({ 
            userEmail: userEmail, // Ab ye khali nahi jayega
            name, 
            address, 
            phone, 
            items, 
            totalBill 
        });

        // 3. Gmail Notification logic
        const itemsList = items.map(item => `${item.name} (x${item.qty})`).join(', ');
        const mailOptions = {
            from: 'Beauty Parcel <ranahassanali.4465@gmail.com>',
            to: 'ranahassanali.4465@gmail.com',
            subject: `New Order from ${name} 🛍️`,
            text: `Email: ${userEmail}\nCustomer: ${name}\nAddress: ${address}\nTotal: Rs. ${totalBill}`
        };

        transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, orderId: newOrder._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});
app.get('/api/my-orders', async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(200).json([]); // Agar login nahi hai to khali array bhej do
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        // ⭐ Sirf matches dhundo jahan userEmail match ho rahi ho
        const orders = await Order.find({ userEmail: decoded.email }).sort({ date: -1 });
        
        res.status(200).json(orders);
    } catch (err) {
        console.error("Fetch History Error:", err);
        res.status(500).json({ message: "Server error" });
    }
});
// Contact Message Route
app.post('/api/contact', async (req, res) => {
    try {
        const { title, message } = req.body;
        const token = req.cookies.token;

        // 1. Check Login Status
        if (!token) {
            return res.status(401).json({ success: false, message: "Please login first" });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const userEmail = decoded.email;

        // 2. Email Configuration
        const mailOptions = {
            from: 'Beauty Parcel Support <ranahassanali.4465@gmail.com>',
            to: 'ranahassanali.4465@gmail.com', // Aapki apni email
            subject: `Contact Form: ${title}`,
            text: `Message from: ${userEmail}\n\nTitle: ${title}\n\nMessage:\n${message}`
        };

        // 3. Send Email
        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, message: "Message sent successfully!" });
    } catch (err) {
        console.error("Contact Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
app.get(`/`,(req,res)=>{
    res.redirect(`https://beauty-parcel.vercel.app/`);
})
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend: http://localhost:${PORT}`));