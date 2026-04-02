let express = require('express')
let router = express.Router()
let messageModel = require('../schemas/messages')
const { checkLogin } = require('../utils/authHandler')

// GET / - Lấy message cuối cùng của mỗi user mà user hiện tại nhắn tin hoặc user khác nhắn cho user hiện tại
router.get("/", checkLogin, async function (req, res, next) {
  try {
    let userId = req.user._id;
    
    // Tìm tất cả các user mà user hiện tại có cuộc trò chuyện
    let conversations = await messageModel.aggregate([
      {
        $match: {
          $or: [
            { from: new (require('mongodb').ObjectId)(userId) },
            { to: new (require('mongodb').ObjectId)(userId) }
          ],
          isDeleted: false
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$from", new (require('mongodb').ObjectId)(userId)] },
              "$to",
              "$from"
            ]
          },
          lastMessage: { $first: "$$ROOT" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $sort: { "lastMessage.createdAt": -1 }
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          lastMessage: "$lastMessage",
          user: "$user"
        }
      }
    ]);

    res.send(conversations);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// GET /:userID - Lấy toàn bộ message giữa user hiện tại và userID
router.get("/:userID", checkLogin, async function (req, res, next) {
  try {
    let userId = req.user._id;
    let targetUserId = req.params.userID;

    let messages = await messageModel.find({
      $or: [
        { from: userId, to: targetUserId },
        { from: targetUserId, to: userId }
      ],
      isDeleted: false
    })
      .populate("from", "username fullName avatarUrl")
      .populate("to", "username fullName avatarUrl")
      .sort({ createdAt: 1 });

    if (messages.length === 0) {
      return res.send({ message: "No messages found", messages: [] });
    }

    res.send(messages);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// POST / - Gửi message
router.post("/", checkLogin, async function (req, res, next) {
  try {
    let userId = req.user._id;
    let { type, text, to } = req.body;

    // Validate
    if (!to) {
      return res.status(400).send({ message: "Recipient (to) is required" });
    }

    if (!text) {
      return res.status(400).send({ message: "Message content (text) is required" });
    }

    if (!type || !["text", "file"].includes(type)) {
      return res.status(400).send({ message: "Type must be 'text' or 'file'" });
    }

    // Kiểm tra xem user nhận tin có tồn tại không
    let userModel = require('../schemas/users');
    let targetUser = await userModel.findById(to);
    if (!targetUser) {
      return res.status(404).send({ message: "Recipient user not found" });
    }

    // Tạo message
    let newMessage = new messageModel({
      from: userId,
      to: to,
      type: type,
      text: text
    });

    let savedMessage = await newMessage.save();

    // Populate related data
    let populatedMessage = await messageModel.findById(savedMessage._id)
      .populate("from", "username fullName avatarUrl")
      .populate("to", "username fullName avatarUrl");

    res.status(201).send(populatedMessage);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

module.exports = router;
