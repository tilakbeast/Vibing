import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import axios from 'axios'
import './App.css'
import { useEffect } from 'react'


const dat = {

  name: "Tilak",
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
}



function App() {
  const [count, setCount] = useState(0);
  const [data, setData] = useState("yes");
  const [approved, setApproved] = useState("No");
  const [match, setMatch] = useState("");

  async function sendData(dat) {

    const resp = await axios.post('http://localhost:3000/find', dat);

    if(resp.data.length !== 0) {

      setApproved(resp.data);

    }

      
    else console.log("fail")
      

    return resp;
      
  }

  useEffect(() => {

    axios.get('http://localhost:3000/')
    .then((res) => { return res})
    .then(res => setData(res.data))
    .catch(error => console.log(error));

    const received = sendData(dat);

    console.log("Running")
    

    // console.log(received);

  }, [count])

  return (

    <>    
        <button onClick={() => setCount((count) => count + 1)}>
        
          count is {count}
        
        </button>

        <p> hello {data.name} </p>
        <p> hello {JSON.stringify(approved)} </p>

    </>
  )
}

export default App
