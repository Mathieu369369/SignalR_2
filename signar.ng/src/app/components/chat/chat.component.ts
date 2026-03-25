import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Channel, UserEntry } from '../../models/models';
import { AuthenticationService } from 'src/app/services/authentication.service';
import * as signalR from "@microsoft/signalr"

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit {

  message: string = "";
  messages: string[] = [];

  usersList: UserEntry[] = [];
  channelsList: Channel[] = [];

  isConnectedToHub: boolean = false;
  newChannelName: string = "";

  selectedChannel: Channel | null = null;
  selectedUser: UserEntry | null = null;

  private hubConnection?: signalR.HubConnection

  constructor(public http: HttpClient, public authentication: AuthenticationService) { }

  ngOnInit() {
    this.connectToHub();
  }
connectToHub() {
  // 1. On crée l'instance et on l'affecte à la variable de classe
  this.hubConnection = new signalR.HubConnectionBuilder()
    .withUrl('http://localhost:5106/chat', { 
      accessTokenFactory: () => localStorage.getItem("token") || "" 
    })
    .withAutomaticReconnect()
    .build();

  // 2. On utilise une constante locale pour "prouver" à TS que ce n'est pas null
  const connection = this.hubConnection;

  // 3. On configure les écouteurs sur cette constante
  connection.on('ChannelsList', (data: Channel[]) => {
    console.log("📺 [SignalR] Liste des canaux reçue:", data);
    this.channelsList = data;
  });

  connection.on('UsersList', (data: UserEntry[]) => {
    console.log("👥 [SignalR] Liste des utilisateurs reçue:", data);
    this.usersList = data;
  });

  connection.on('NewMessage', (message: string) => {
    console.log("💬 [SignalR] Message reçu:", message);
    this.messages.push(message);
  });

  // 4. On démarre la connexion
  connection.start()
    .then(() => {
      this.isConnectedToHub = true;
      console.log('✅ [SignalR] Connecté avec succès');
    })
    .catch(err => {
      console.error('❌ [SignalR] Erreur de démarrage:', err);
    });
}

  // --- ACTIONS ---

joinChannel(channel: Channel) {
  const oldId = this.selectedChannel ? this.selectedChannel.id : 0;
  console.log(`🔄 [SignalR] Changement de canal: ${oldId} -> ${channel.id}`);
  
  this.hubConnection!.invoke('JoinChannel', oldId, channel.id);
  this.selectedChannel = channel;
}

  leaveChannel() {
    let oldId = this.selectedChannel ? this.selectedChannel.id : 0;
    this.hubConnection!.invoke('JoinChannel', oldId, 0);
    this.selectedChannel = null;
  }

sendMessage() {
  const channelId = this.selectedChannel ? this.selectedChannel.id : 0;
  const targetUser = this.selectedUser?.value || "Tout le monde";

  console.log(`📤 [SignalR] Envoi du message: "${this.message}" vers ChannelID: ${channelId}, Cible: ${targetUser}`);
  
  this.hubConnection!.invoke('SendMessage', this.message, channelId, this.selectedUser?.value)
    .then(() => this.message = "")
    .catch(err => console.error("❌ Erreur SendMessage:", err));
}

  userClick(user: UserEntry) {
    // Si on reclique sur le même, on désélectionne (retour au mode public)
    if (this.selectedUser && user.value === this.selectedUser.value) {
      this.selectedUser = null;
    } else {
      this.selectedUser = user;
      this.selectedChannel = null; // On désactive le canal si on fait un MP
    }
  }

createChannel() {
  if (this.newChannelName.trim().length > 0) {
    console.log(`🆕 Tentative de création du canal: ${this.newChannelName}`);
    
    // On envoie le nom au serveur
    this.hubConnection!.invoke('CreateChannel', this.newChannelName)
      .then(() => {
        this.newChannelName = ""; // On vide le champ après succès
      })
      .catch(err => console.error("❌ Erreur création canal:", err));
  }
}

  deleteChannel(channel: Channel) {
    this.hubConnection!.invoke('DeleteChannel', channel.id);
  }

  logout() {
    if (this.hubConnection) {
      this.hubConnection.stop()
        .then(() => {
          this.isConnectedToHub = false;
          this.authentication.logout();
        })
        .catch(err => console.error("Erreur stop:", err));
    } else {
      this.authentication.logout();
    }
  }
}