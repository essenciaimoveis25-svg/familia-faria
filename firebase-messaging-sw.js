importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCLxkaqV0MqG9niuOk4x0bLDtdUTaX2e-Q",
  authDomain: "familia-faria-125d8.firebaseapp.com",
  databaseURL: "https://familia-faria-125d8-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "familia-faria-125d8",
  storageBucket: "familia-faria-125d8.firebasestorage.app",
  messagingSenderId: "367125745712",
  appId: "1:367125745712:web:a99c20e4e194c3bffd1df5"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/icon-192.png',
    tag: 'familia-evento',
    renotify: true,
    vibrate: [200, 100, 200]
  });
});
