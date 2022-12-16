const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const app = express();
app.use(express.json());

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server run at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`db error: ${e.message}`);
  }
};
initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;
  const encryptedPassword = await bcrypt.hash(password, 10);
  const checkUserDetails = `
        SELECT * FROM user WHERE username = '${username}';`;
  if (checkUserDetails === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const addUserDetails = `
                INSERT INTO 
                    user(name, username,  password, gender)
                VALUES (
                    '${name}',
                    '${username}',
                    '${encryptedPassword}',
                    '${gender}');`;
      await db.run(addUserDetails);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API2
app.post("/login/", async (request, response) => {
  const userDetailsBody = request.body;
  const { username, password } = userDetailsBody;
  const checkRegisterUser = `
        SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(checkRegisterUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatches = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatches === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "My_Secret_Key");
      const token = {
        jwtToken: jwtToken,
      };
      console.log(token);
      response.send(token);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication with JWT Token
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];
    jwt.verify(jwtToken, "My_Secret_Key", async (error, payload) => {
      if (error) {
        response.statue(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API3
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    try {
      const getUserTweetQuery = `
        SELECT
            user.username AS username,
            tweet.tweet AS tweet,
            tweet.date_time AS dateTime
        FROM
            user NATURAL JOIN tweet
        WHERE 
            user.user_id IN (
                SELECT
                    following_user_id
                FROM
                    follower
                GROUP BY
                    follower_user_id
            )
        ORDER BY tweet.date_time DESC
        LIMIT 4;`;
      const details = await db.all(getUserTweetQuery);
      response.send(details);
    } catch (e) {
      console.log(`${e.message}`);
    }
  }
);

// api4
app.get("/user/following/", authenticationToken, async (request, response) => {
  const followingQuery = `
        SELECT 
            user.name AS name 
        FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
        ORDER BY 
            user.user_id;`;
  const followingUserDetails = await db.all(followingQuery);
  console.log(followingUserDetails);
  response.send(followingUserDetails);
});

// API 5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const followerQuery = `
        SELECT
            user.name AS name
        FROM
            user INNER JOIN follower ON user.user_id = follower.follower_user_id
        ORDER BY 
            follower.follower_user_id;`;
  const followerDetails = await db.all(followerQuery);
  response.send(followerDetails);
});

// api 6
app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  try {
    const { tweetId } = request.params;
    const detailsQuery = `
        SELECT
            following_user_id
        FROM 
            follower
        WHERE 
             follower_user_id = following_user_id
        GROUP BY
            follower_user_id;`;
    const dbUser = await db.get(detailsQuery);
    if (dbUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const detailsQuery = `
            SELECT 
                T1.tweet AS tweet,
                count(T1.like_id) as likes,
                COUNT(reply_id) AS replies,
                T1.date_time AS dateTime
            FROM (tweet INNER JOIN like ON tweet.user_id = like.user_id) AS T1
                INNER JOIN reply ON T1.user_id = reply.user_id
            WHERE T1.tweet_id = ${tweetId}
            GROUP BY T1.user_id;`;
      const detailsUser = await db.get(detailsQuery);
      response.send(detailsUser);
    }
  } catch (e) {
    console.log(`error: ${e.message}`);
  }
});

// api 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    try {
      const { tweetId } = request.params;
      const repliesQuery = `
        SELECT 
            reply,
            (
                SELECT
                    follower_user_id
                FROM follower
                WHERE
                    follower_user_id = following_user_id
            ) AS request_user_id
            FROM 
                reply
            WHERE tweet_id = ${tweetId};`;
      const replyDetails = await db.all(repliesQuery);
      response.send(replyDetails);
    } catch (e) {
      console.log(`error: ${e.message}`);
    }
  }
);

//api 9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  try {
    const detailsQuery = `
        SELECT 
            T1.tweet AS tweet,
            count(T1.like_id) as likes,
            COUNT(reply_id) AS replies,
            T1.date_time AS dateTime
        FROM (tweet INNER JOIN like ON tweet.user_id = like.user_id) AS T1
            INNER JOIN reply ON T1.user_id = reply.user_id
        GROUP BY T1.user_id;`;
    const detailsUserAll = await db.all(detailsQuery);
    response.send(detailsUserAll);
  } catch (e) {
    console.log(`error: ${e.message}`);
  }
});
//api10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const tweetRequest = request.body;
  const { tweet } = tweetRequest;
  const addTweetQuery = `
        INSERT INTO 
           tweet (tweet)
        VALUES 
            ('${tweet}');`;
  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

// api11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const query = `DELETE FROM  tweet WHERE tweet_id = ${tweetId};`;
    const tweetUser = await db.run(query);
    if (tweetUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
