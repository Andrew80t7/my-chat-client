import React, { useEffect, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client, Frame, Message } from '@stomp/stompjs';

interface ChatMessage {
  senderId: number;
  chatId: number;
  text: string;
}

const WebSocketClient: React.FC = () => {

  const [stompClient, setStompClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080';
    const socket = new SockJS(`${backendUrl}/ws`);
    
    const client = new Client({
      webSocketFactory: () => socket,
      debug: (str) => console.log(str),
      reconnectDelay: 5000, // Попытки переподключения каждые 5 секунд
      onConnect: (frame: Frame) => {
        
        console.log('Connected: ', frame);
        // Подписываемся на канал для чата с id 1
        client.subscribe('/topic/chat/1', (message: Message) => {
          try {
            const chatMessage: ChatMessage = JSON.parse(message.body);
            setMessages(prevMessages => [...prevMessages, chatMessage]);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });
      },
      onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
      },
    });

    client.activate();
    setStompClient(client);

    // Очистка подключения при размонтировании компонента
    return () => {
      client.deactivate();
    };
  }, []);

  const sendMessage = () => {
    if (stompClient && stompClient.active) {
      // Пример создания сообщения: здесь senderId и chatId установлены статически
      const message: ChatMessage = { senderId: 1, chatId: 1, text: input };
      stompClient.publish({
        destination: '/app/chat.sendMessage',
        body: JSON.stringify(message),
      });
      setInput('');
    }
  };

  return (
    <div>
      <h2>Chat Room</h2>
      <div 
        style={{ border: '1px solid #ccc', padding: '10px', height: '300px', overflowY: 'scroll' }}>
        {messages.map((msg, index) => (
          <p key={index}>
            <strong>{msg.senderId}</strong>: {msg.text}
          </p>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a message..."
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
};

export default WebSocketClient;
