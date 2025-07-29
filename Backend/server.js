const express = require('express')
const cors = require('cors');
const { time, timeStamp } = require('console');

const {
  addMatch,
  isAlreadyMatched,
  getMatchedUsers,
  addActive,
  getActiveUsers
} = require('./redis/matchservice');

const app = express()

const port = 3000;

app.use(express.json());

app.use(cors());

dat = {
    "name" : "Tilak",
    "preference" : "Female"
}

const people = [
  {
    name: "Aanya Sharma",
    gender: "female",
    preferences: [
      "Adventurous",
      "Outgoing",
      "Driven",
      "Imaginative",
      "Active Lifestyle",
      "Analytical",
      "Enjoys Animals",
      "Selective Eater",
      "Night-Oriented",
      "Family-Centered"
    ],
    bitmaskBinary: "1011111011",
    bitmaskDecimal: 763
  },
  {
    name: "Rohan Mehta",
    gender: "male",
    preferences: [
      "Grounded",
      "Reserved",
      "Easygoing",
      "Pragmatic",
      "Relaxed Lifestyle",
      "Spiritual",
      "Less Focused on Pets",
      "Adventurous Eater",
      "Morning-Oriented",
      "Independence-Centered"
    ],
    bitmaskBinary: "0100000100",
    bitmaskDecimal: 260
  },
  
  {
    name: "Meera Iyer",
    gender: "female",
    preferences: [
      "Adventurous",
      "Reserved",
      "Easygoing",
      "Pragmatic",
      "Relaxed Lifestyle",
      "Analytical",
      "Enjoys Animals",
      "Adventurous Eater",
      "Night-Oriented",
      "Independence-Centered"
    ],
    bitmaskBinary: "1000101110",
    bitmaskDecimal: 558
  },

  {
    name: "Kabir Roy",
    gender: "male",
    preferences: [
      "Grounded",
      "Outgoing",
      "Driven",
      "Imaginative",
      "Active Lifestyle",
      "Spiritual",
      "Enjoys Animals",
      "Adventurous Eater",
      "Morning-Oriented",
      "Family-Centered"
    ],
    bitmaskBinary: "1111011010",
    bitmaskDecimal: 986
  },
  {
    name: "Sanya Kapoor",
    gender: "female",
    preferences: [
      "Adventurous",
      "Reserved",
      "Driven",
      "Pragmatic",
      "Relaxed Lifestyle",
      "Analytical",
      "Less Focused on Pets",
      "Selective Eater",
      "Night-Oriented",
      "Family-Centered"
    ],
    bitmaskBinary: "1000100111",
    bitmaskDecimal: 583
  },
  {
    name: "Arjun Verma",
    gender: "male",
    preferences: [
      "Grounded",
      "Reserved",
      "Driven",
      "Imaginative",
      "Relaxed Lifestyle",
      "Analytical",
      "Less Focused on Pets",
      "Adventurous Eater",
      "Morning-Oriented",
      "Family-Centered"
    ],
    bitmaskBinary: "0110110010",
    bitmaskDecimal: 434
  }
];

console.log("Starting")

function popcount(n) {

  let count = 0;

  while(n > 0) {

    count += (n & 1);

    n >>= 1;

  }

  return count;


}

app.get('/', (req, res) => {

    res.send(dat);
});

app.post('/find', async (req, res) => {

  // console.log(req.body)

  const per = req.body;

  const p = parseInt(req.body.bitmaskBinary, 2);

  await addActive(per.name);

  const lis = await getActiveUsers();

  console.log("Checking if added: ", lis);

  console.log("Matched array: ", await getMatchedUsers(per.name));


  let maxm = 0;
  let maxp = {};

  for(let i of people) {

    if(per.name === i.name) continue;

    const already = await isAlreadyMatched(per.name, i.name);

    // console.log("already: ", already);

    if(already === 1) {

      console.log("found: ", i.name);
      
      continue
    }

    // else console.log("isAlreadyMatched working")

    let j = parseInt(i.bitmaskBinary, 2);

    const val = (j & p);

    const x = popcount(val);

    if(x > maxm) {

      maxp = i;

      maxm = x;

    }
  } 
  

  // console.log("Max: ", maxm, "\nperson : ", maxp);

  await addMatch(per.name, maxp.name);

  res.send(maxp);

});



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})
