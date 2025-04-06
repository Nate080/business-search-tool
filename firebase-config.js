// Import Firebase SDK
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAUYgShz_0mR4QtR_qzuLmcbdBAVe3f3rA",
    authDomain: "bbbserch-2b41a.firebaseapp.com",
    projectId: "bbbserch-2b41a",
    storageBucket: "bbbserch-2b41a.firebasestorage.app",
    messagingSenderId: "24471607170",
    appId: "1:24471607170:web:ed541f869e4095b1f8a19b",
    measurementId: "G-YLKSTFJP23"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// User tracking functions
async function logUserLogin(fullName) {
    try {
        await addDoc(collection(db, 'user_activity'), {
            name: fullName,
            action: 'login',
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error('Error logging user login:', error);
    }
}

async function logSearchStart(fullName, searchConfig) {
    try {
        const docRef = await addDoc(collection(db, 'searches'), {
            user: fullName,
            config: searchConfig,
            status: 'started',
            startTime: serverTimestamp(),
            progress: 0,
            results: []
        });
        return docRef.id;
    } catch (error) {
        console.error('Error logging search start:', error);
        return null;
    }
}

async function updateSearchProgress(searchId, progress, results) {
    try {
        const searchRef = doc(db, 'searches', searchId);
        await updateDoc(searchRef, {
            progress: progress,
            results: arrayUnion(...results),
            lastUpdate: serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating search progress:', error);
    }
}

async function completeSearch(searchId, finalResults) {
    try {
        const searchRef = doc(db, 'searches', searchId);
        await updateDoc(searchRef, {
            status: 'completed',
            progress: 100,
            results: finalResults,
            endTime: serverTimestamp()
        });
    } catch (error) {
        console.error('Error completing search:', error);
    }
}

// Export functions
export const firebaseUtils = {
    logUserLogin,
    logSearchStart,
    updateSearchProgress,
    completeSearch
}; 