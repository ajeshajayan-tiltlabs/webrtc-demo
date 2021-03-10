import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { io } from 'socket.io-client';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'firebase-rtc-angular';

  mediaStreams: MediaStream;

  remoteStream: MediaStream;

  peerConnection: RTCPeerConnection;

  socket = io(environment.SOCKET_ENDPOINT);

  socketId: string;

  peerSocketId: string;

  localRTCIceCandidate: RTCIceCandidate;

  datachannel: RTCDataChannel;

  message = new FormControl();

  ngOnInit() {

    this.socket.on('onConnection', (sockertId: string) => {
      console.log('onConnection', sockertId);

      this.socketId = sockertId;
    })
  }

  async getMediaStreams() {
    const openMediaDevices = async (constraints) => {
      return await navigator.mediaDevices.getUserMedia(constraints);
    }

    try {
      this.mediaStreams = await openMediaDevices({ 'video': true, 'audio': true });
      console.log('Got MediaStream:', this.mediaStreams);
      this.playVideoFromCamera();
    } catch (error) {
      console.error('Error accessing media devices.', error);
    }
  }

  async playVideoFromCamera() {
    try {
      const videoElement = document.querySelector('video#localVideo');
      (videoElement as any).srcObject = this.mediaStreams;
    } catch (error) {
      console.error('Error opening video camera.', error);
    }
  }

  async makeCall() {
    console.log("making call...");

    const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
    this.peerConnection = new RTCPeerConnection(configuration)
    console.log('Creating data channel');

    this.datachannel = this.peerConnection.createDataChannel('chat');

    console.log('Data channel created');

    // Enable textarea and button when opened
    this.datachannel.addEventListener('open', event => {
      console.log('Data channel oppened');

    });

    // Disable input when closed
    this.datachannel.addEventListener('close', event => {
      console.log('Data channel closed');

    });
    

    // lisen to messages
    this.datachannel.addEventListener('message', (event) => {
      console.log('Incomming message', event.data);

    })


    // lisen to remote streams
    this.peerConnection.addEventListener('track', async (event) => {
      console.log('Adding stream tracks');
      this.remoteStream = new MediaStream()
      // initialse remote streams
      const remoteVideo: any = document.querySelector('#remoteVideo');
      remoteVideo.srcObject = this.remoteStream;
      this.remoteStream.addTrack(event.track);
    });

    // adding media track to remote / peer
    this.mediaStreams.getTracks().forEach(t => {
      this.peerConnection.addTrack(t, this.mediaStreams)
    })

    this.socket.on('answer', async ({ answer, socketId }) => {

      if (answer) {
        console.log('Got answer from...', socketId);

        this.peerSocketId = socketId;
        console.log('on answer peerSocketId', this.peerSocketId);


        const remoteDesc = new RTCSessionDescription(answer);
        await this.peerConnection.setRemoteDescription(remoteDesc);

        console.log('Trying to connect...');

        console.log('Sending new ice candidate...', this.peerSocketId);
        this.socket.emit('newicecandidate', { 'newIceCandidate': this.localRTCIceCandidate, peerSocketId: this.peerSocketId });

      }
    });

    this._lisen();

    const offer = await this.peerConnection.createOffer({ offerToReceiveAudio: true });
    await this.peerConnection.setLocalDescription(offer);
    this.socket.emit('offer', { offer, socketId: this.socketId });

    console.log('Waiting for replay...');
  }

  readyToJoin() {
    console.log('Wating for call...');

    this.socket.on('offer', async ({ offer, socketId }) => {
      console.log('Got a call from...', socketId);


      this.peerSocketId = socketId
      console.log('on offer perrId', this.peerSocketId);

      if (offer) {

        const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
        this.peerConnection = new RTCPeerConnection(configuration);
        // lisen to remote streams
        this.peerConnection.addEventListener('track', async (event) => {
          console.log('Adding stream tracks');
          this.remoteStream = new MediaStream()
          // initialse remote streams
          const remoteVideo: any = document.querySelector('#remoteVideo');
          remoteVideo.srcObject = this.remoteStream;
          this.remoteStream.addTrack(event.track);
        });
        // adding media track to remote / peer
        this.mediaStreams.getTracks().forEach(t => {
          this.peerConnection.addTrack(t, this.mediaStreams)
        })

        //lisenToDataChannel
        this.peerConnection.addEventListener('datachannel', event => {
          console.log('Data channel created');

          this.datachannel = event.channel;

          // Enable textarea and button when opened
          this.datachannel.addEventListener('open', event => {
            console.log('Data channel oppened');

          });

          // Disable input when closed
          this.datachannel.addEventListener('close', event => {
            console.log('Data channel closed');

          });

          // lisen to messages
          this.datachannel.addEventListener('message', (event) => {
            console.log('Incomming message', event.data);

          })
        });
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.socket.emit('answer', { 'answer': answer, socketId: this.socketId });
        console.log('Sending answer...');

        this._lisen();

      }
    })
  }

  stopMedia() {
    this.mediaStreams.getTracks().forEach(track => {
      track.stop()
    });
  }

  private _lisen() {

    // Listen for local ICE candidates on the local RTCPeerConnection
    this.peerConnection.addEventListener('icecandidate', event => {

      if (event.candidate) {
        this.localRTCIceCandidate = event.candidate;
        console.log('Sending new ice candidate...', this.peerSocketId);
        this.socket.emit('newicecandidate', { 'newIceCandidate': event.candidate, peerSocketId: this.peerSocketId });
      }
    });

    // Listen for remote ICE candidates and add them to the local RTCPeerConnection
    this.socket.on('ice-gathering', async message => {
      console.log('Reciving ICE candidate...', message);
      if (message.newIceCandidate) {

        try {
          await this.peerConnection.addIceCandidate(message.newIceCandidate);
          console.log('Recived ICE candidate');
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      }
    });

    // this.peerConnection.addEventListener('icegatheringstatechange', (e: any) => {
    //   console.log('ICE gatheing...', e.target);

    // })

    this.peerConnection.addEventListener('connectionstatechange', (e: any) => {
      console.log("connection state here", this.peerConnection);
      console.log('connection *****', this.peerConnection.connectionState);


      if (e.target.connectionState === 'connected') {
        console.log('You are connected to', this.peerSocketId)
      }

    }, false)
  }

  sendMessage() {
    this.datachannel.send(this.message.value);
  }

}
