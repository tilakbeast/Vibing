import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Register from "./components/Register";
import Login from "./components/Login";
import MainPage from "./components/Mainpage";

const App = () => {
  const [socket, setSocket] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));

  console.log("top token: ", token);
  console.log("Token type:", typeof token);

  const [showLogin, setShowLogin] = useState(true);

  useEffect(() => {

    console.log("token: ", token, "Socket: ", socket);
    if (token && !socket) {
      const s = io("http://localhost:3000", { auth: { token } });

      console.log("The token is: ", token, showLogin);
      console.log("The socket is: ", s);

      s.on("connect", () => console.log("Socket connected:", s.id));


      // if(s)
      // console.log("userId: ", s.data.userId);

      s.on("connect_error", (err) => {

        setShowLogin(true);

        setToken("")

        setSocket(null);

        console.error("Socket error here:", err.message);
      }
      
      );
      setSocket(s);
    }

    if(socket)

    return (() => {return socket.disconnect()})
  }, [token, showLogin]);

  const handleAuthSuccess = (newToken) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setShowLogin(false);
  };

  return (
    <>
      {!token ? (
        showLogin ? (
          <>
          <Login
            onLoginSuccess={handleAuthSuccess} setShowLogin = {setShowLogin}
          />

          <button onClick = {() => {setShowLogin(false)}}> Register </button>

          </>
        ) : (
          <Register onRegisterSuccess={handleAuthSuccess}
          />
        )
      ) : (
        // <h1> Mainpage </h1>
        socket ? (

          <MainPage socket = {socket} token = {token}/>
        ) :

        <h1> Loading </h1>
        
      )}
    </>
  );
};

export default App;
