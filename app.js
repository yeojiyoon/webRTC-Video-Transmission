let peerConnection;
let dataChannel;
let fileInput = document.getElementById("fileInput");
let receivedVideo = document.getElementById("receivedVideo");
let status = document.getElementById("status");

const CHUNK_SIZE = 65536; // 조각 크기
let startTime, endTime;
const signalingSocket = new WebSocket('ws://localhost:8080');

signalingSocket.onmessage = async (message) => {
    console.log("Received message:", message.data); // 수신된 메시지 로그

    // 문자열로 된 데이터인지 확인 후 JSON 파싱
    if (typeof message.data === "string") 
    {
        try 
        {
            const data = JSON.parse(message.data);
            console.log("Parsed data:", data); // 파싱된 데이터 로그

            if (data.offer) 
            {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                signalingSocket.send(JSON.stringify({ answer: answer }));
            }
            else if (data.answer) 
            {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
            else if (data.iceCandidate) 
            {
                peerConnection.addIceCandidate(new RTCIceCandidate(data.iceCandidate));
            }
        }
        catch (error)
        {
            console.error("Error parsing message:", error); // 오류 로그
        }
    }
};

// 파일 송신 시작
function startSender() {
    setupConnection();
    console.log("Sender: Setting up connection.");
    dataChannel.onopen = () => { //수정 필요
        console.log("dataChannel open");
        status.innerText = "전송 시작...";
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
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
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
    startTime = performance.now();
    console.log("Sending file:", file.name); // 전송할 파일 이름 로그

    fileReader.onload = event => {
        console.log("Sending chunk size:", event.target.result.byteLength); // 송신 조각 로그
        dataChannel.send(event.target.result); // ArrayBuffer를 전송합니다.
        offset += CHUNK_SIZE;

        if (offset < file.size) 
        {
            readSlice(offset);
        } 
        else 
        {
            endTime = performance.now();
            const timeTaken = (endTime - startTime) / 1000;
            status.innerText = `파일 전송 완료. 소요 시간: ${timeTaken.toFixed(2)} 초`;
            console.log("Total file size sent:", file.size); // 전체 파일 크기 로그
        }
    };

    function readSlice(o) 
    {
        const slice = file.slice(offset, o + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice); // 파일 조각을 읽습니다.
    }

    readSlice(0);
}

// 파일 수신 함수
function receiveFile() {
    let receivedChunks = [];
    startTime = performance.now();
    console.log("Waiting for incoming chunks...");

    dataChannel.onmessage = event => {
        console.log("Received chunk size:", event.data.byteLength); // 수신 조각 크기 로그

        if (event.data instanceof ArrayBuffer) 
        { // 수신된 데이터가 ArrayBuffer인지 확인
            receivedChunks.push(event.data); // ArrayBuffer 조각을 저장합니다.
            console.log("Total received chunks:", receivedChunks.length); // 수신된 조각 수 로그

        // 모든 조각이 수신되었는지 확인
            if (event.data.byteLength < CHUNK_SIZE) 
            {
                const receivedBlob = new Blob(receivedChunks, { type: 'video/mp4' }); // Blob 객체 생성 시 타입 지정
                console.log("Received blob size:", receivedBlob.size); // Blob 크기 로그

                const videoURL = URL.createObjectURL(receivedBlob); // Blob URL 생성
                receivedVideo.src = videoURL; // 비디오 요소에 Blob URL 설정
                receivedVideo.play(); // 비디오 재생
                endTime = performance.now();
                const timeTaken = (endTime - startTime) / 1000;
                status.innerText = `파일 수신 완료. 소요 시간: ${timeTaken.toFixed(2)} 초`;
            }
            else 
            {
                console.error("Received unexpected data type:", event.data); // 예기치 않은 데이터 타입 로그
            }
        };
    }
}
