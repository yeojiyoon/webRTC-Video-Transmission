let peerConnection;
let dataChannel;
let fileInput = document.getElementById("fileInput");
let receivedVideo = document.getElementById("receivedVideo");
let status = document.getElementById("status");

let sentChunks = 0; // 송신된 총 청크 수
let receivedChunksCount = 0; // 수신된 총 청크 수
let expectedSentChunks = 0; 

const CHUNK_SIZE = 8192; // 조각 크기
let startTime, endTime;
const signalingSocket = new WebSocket('ws://localhost:8080');

signalingSocket.onmessage = async (message) => {
    console.log("Received message:", message.data);

    if (typeof message.data === "string") {
        // 문자열로 수신된 경우
        handleSignalingData(message.data);
    } else if (message.data instanceof Blob) {
        // Blob 형태로 수신된 경우 문자열로 변환
        const text = await message.data.text();
        handleSignalingData(text);
    } else {
        console.log("signaling failed");
    }
};

async function handleSignalingData(data) {
    try {
        const parsedData = JSON.parse(data);
        console.log("Parsed data:", parsedData);
        
        if (parsedData.sentChunks) {
            expectedSentChunks = parsedData.sentChunks;
            console.log(`Expected sent chunks received and set: ${expectedSentChunks}`); // 수신 확인 로그 추가
        }
        if (parsedData.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(parsedData.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            signalingSocket.send(JSON.stringify({ answer: answer }));
        } else if (parsedData.answer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(parsedData.answer));
        } else if (parsedData.iceCandidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(parsedData.iceCandidate));
        }
    } catch (error) {
        console.error("Error parsing message:", error);
    }
}



// 파일 송신 시작
function startSender() {
    setupConnection();
    console.log("Sender: Setting up connection.");
    dataChannel = peerConnection.createDataChannel("fileTransfer");
    console.log(dataChannel);

    dataChannel.onopen = () => {
        console.log("Data channel is open and ready to be used.");
        status.innerText = "Data channel is open.";
        if (fileInput.files.length > 0) 
            {
                console.log("fileInput.files.length>0");
                sendFile(fileInput.files[0]);
            }
            else 
            {
                console.log("file is empty");
            }
    };

    dataChannel.onclose = () => {
        console.log("Data channel is closed.");
        status.innerText = "Data channel is closed.";
    };

    dataChannel.onerror = (error) => {
        console.error("Data channel error:", error);
        status.innerText = "Data channel error.";
    };
}

// 파일 수신 시작
function startReceiver() {
    setupConnection();
    console.log("Receiver: Setting up connection.");
    peerConnection.ondatachannel = (event) => {
        console.log("open datachannel");
        dataChannel = event.channel;
        receiveFile();
    };
}

// 연결 설정
function setupConnection() {
    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: "turn:your-turn-server.com:3478", // 실제 TURN 서버 URL로 대체
                username: "username", // TURN 서버의 사용자 이름
                credential: "password" // TURN 서버의 비밀번호
            }
        ]
    });
    if(!peerConnection) 
    {
        console.log("peerConnection is empty!");
    }
    else
    {
        console.log("Peer connection created.");
    }

    peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === "connected") {
            console.log("Peer connected!");
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("ICE candidate:", event.candidate);
            signalingSocket.send(JSON.stringify({ iceCandidate: event.candidate }));
        } else {
            console.log("All ICE candidates have been sent.");
        }
    };

    peerConnection.onicecandidateerror = (event) => {
        console.error("ICE Candidate Error:", event.errorText);
    };

    if (!dataChannel) 
    {
        console.log("Creating data channel.");
        dataChannel = peerConnection.createDataChannel("fileTransfer");
        dataChannel.binaryType = "arraybuffer";
    }
    else
    {
        console.log("Data channel already exists.");
    }

    peerConnection.createOffer().then(offer => {
        console.log("Creating offer.");
        return peerConnection.setLocalDescription(offer);
    }).then(() => {
        signalingSocket.send(JSON.stringify({ offer: peerConnection.localDescription }));
    }).catch(error => {
        console.error("Error during offer creation:", error);
    });
}

// 파일 송신 함수
function sendFile(file) {
    let fileReader = new FileReader();
    let offset = 0;
    sentChunks = 0;
    startTime = performance.now();

    fileReader.onload = event => {
        dataChannel.send(event.target.result);
        offset += CHUNK_SIZE;
        sentChunks++;

        if (offset < file.size) {
            readSlice(offset);
        } else {
            endTime = performance.now();
            const timeTaken = (endTime - startTime) / 1000;
            status.innerText = `파일 전송 완료. 소요 시간: ${timeTaken.toFixed(2)} 초, 총 전송 청크: ${sentChunks}`;
            
            // signaling 서버로 송신된 총 청크 수를 전송
            console.log(`Sending total sent chunks to receiver: ${sentChunks}`);
            signalingSocket.send(JSON.stringify({ sentChunks })); // 전송 확인 로그 추가
        }
    };

    function readSlice(o) {
        const slice = file.slice(offset, o + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    }

    readSlice(0);
}


// 파일 수신 함수
function receiveFile() {
    let receivedChunks = [];
    startTime = performance.now();

    dataChannel.onmessage = event => {
        if (event.data instanceof ArrayBuffer) {
            receivedChunks.push(event.data);
            receivedChunksCount++;

            if (event.data.byteLength < CHUNK_SIZE) {
                const receivedBlob = new Blob(receivedChunks, { type: 'video/mp4' });
                const videoURL = URL.createObjectURL(receivedBlob);
                receivedVideo.src = videoURL;
                receivedVideo.play();
                endTime = performance.now();
                const timeTaken = (endTime - startTime) / 1000;
                status.innerText = `파일 수신 완료. 소요 시간: ${timeTaken.toFixed(2)} 초, 총 수신 청크: ${receivedChunksCount}`;

                // 패킷 손실률 계산 (expectedSentChunks가 0이 아닐 때만)
                if (expectedSentChunks > 0) {
                    const lossRate = ((expectedSentChunks - receivedChunksCount) / expectedSentChunks) * 100;
                    console.log(`패킷 손실률: ${lossRate.toFixed(2)}%`);
                } else {
                    console.warn("Expected sent chunks count is zero, cannot calculate loss rate.");
                }
            }
        } else {
            console.warn("Received unexpected data type:", typeof event.data);
        }
    };
}
