const mongoose = require("mongoose");
const _ = require("lodash");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// JWT Secret
const jwtSecret = "86981063950909437776rameshaz1775321915";

const UserScheman = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    minlength: 1,
    trim: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    minlength: 1,
    trim: true
  },
  sessions: [
    {
      token: {
        type: String,
        required: true
      },
      expiresAt: {
        type: Number,
        required: true
      }
    }
  ]
});

// Instance Methods

UserScheman.methods.toJSON = function() {
  const user = this;
  const userObject = user.toObject();

  /*return the document accept the password and sessions (these shouldn't made available)*/
  return _.omit(userObject, ["password", "sessions"]);
};

UserScheman.methods.generateAccessAuthToken = function() {
  const user = this;
  return new Promise((resolve, reject) => {
    /* Create a json webtoken and return that*/
    jwt.sign(
      { _id: user._id.toHexString() },
      jwtSecret,
      { expiresIn: "15m" },
      (err, token) => {
        if (!err) {
          resolve(token);
        } else {
          /*there is an error*/
          reject();
        }
      }
    );
  });
};

UserScheman.methods.generateRefreshAuthToken = function() {
  /* This method simply generates a 64byte hexa string - it doesn't save it to the database. saveSessionToDatabase() does that. */
  return new Promise((resolve, reject) => {
    crypto.randomBytes(64, (err, buf) => {
      if (!err) {
        /* no error */
        let token = buf.toString("hex");

        return resolve(token);
      }
    });
  });
};

UserScheman.methods.createSession = function() {
  let user = this;

  return user
    .generateRefreshAuthToken()
    .then(refreshToken => {
      return saveSessionToDatabase(user, refreshToken);
    })
    .then(refreshToken => {
      /* saved to database successfully */
      /* now return the refresh token */
      return refreshToken;
    })
    .catch(e => {
      return Promise.reject("Failed to save session to DataBase.\n" + e);
    });
};

// Model Methods (Static Methods)

UserScheman.statics.findByIdAndToken = function(_id, token) {
  /* finds user by id and token */
  /* used in Auth  middleware (verifySession) */

  const User = this;

  return User.findOne({
    _id,
    "sessions.token": token
  });
};

UserScheman.statics.findByCredentials = function(email, password) {
  let User = this;
  return User.findOne({ email }).then(user => {
    if (!user) return Promise.reject();

    return new Promise((resolve, reject) => {
      bcrypt.compare(password, user.password, (err, res) => {
        if (res) resolve(user);
        else {
          reject();
        }
      });
    });
  });
};

UserScheman.statics.hasRefreshTokenExpired = expiresAt => {
  let secondsSinceEpoch = Date.now() / 1000;
  if (expiresAt > secondsSinceEpoch) {
    /* hasn't expired */
    return false;
  } else {
    /* has expired */
    return true;
  }
};

// MiddleWare
// before a user document is saved, this code runs

UserScheman.pre("save", function(next) {
  let user = this;
  let costFactor = 10;

  if (user.isModified("password")) {
    /* if the password field has been eidted/changed then run this code. */

    /* Generate salt and hash password */
    bcrypt.genSalt(costFactor, (err, salt) => {
      bcrypt.hash(user.password, salt, (err, hash) => {
        user.password = hash;
        next();
      });
    });
  } else {
    next();
  }
});

// Help Methods

let saveSessionToDatabase = (user, refreshToken) => {
  /* save session to database */
  return new Promise((resolve, reject) => {
    let expiresAt = generateRefreshTokenExpiryTime();

    user.sessions.push({ token: refreshToken, expiresAt });

    user
      .save()
      .then(() => {
        /* saved session successfully */
        return resolve(refreshToken);
      })
      .catch(e => {
        reject(e);
      });
  });
};
let generateRefreshTokenExpiryTime = () => {
  let DaysUntilExpire = "10";
  let SecondsUntilExpire = DaysUntilExpire * 24 * 60 * 60;
  return Date.now() / 1000 + SecondsUntilExpire;
};

const User = mongoose.model("User", UserScheman);

module.exports = { User };
