using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using signalr.backend.Data;
using signalr.backend.Models;

namespace signalr.backend.Hubs
{
    public static class UserHandler
    {
        public static Dictionary<string, string> UserConnections { get; set; } = new Dictionary<string, string>();
    }

    [Authorize]
    public class ChatHub : Hub
    {
        private readonly ApplicationDbContext _context;

        public IdentityUser CurentUser
        {
            get
            {
                string userid = Context.UserIdentifier!;
                return _context.Users.Single(u => u.Id == userid);
            }
        }

        public ChatHub(ApplicationDbContext context)
        {
            _context = context;
        }

        public override async Task OnConnectedAsync()
        {
            // On ajoute l'utilisateur au dictionnaire (TryAdd évite les crashs si déjà présent)
            UserHandler.UserConnections.TryAdd(CurentUser.Email!, Context.UserIdentifier!);

            // Notification globale de la nouvelle liste d'utilisateurs
            await PushUserList();

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var entry = UserHandler.UserConnections.FirstOrDefault(uc => uc.Value == Context.UserIdentifier);
            if (entry.Key != null)
            {
                UserHandler.UserConnections.Remove(entry.Key);
            }

            await PushUserList();
            await base.OnDisconnectedAsync(exception);
        }

        public async Task CreateChannel(string title)
        {
            _context.Channel.Add(new Channel { Title = title });
            await _context.SaveChangesAsync();

            // Envoyer la liste de channels mise à jour à tout le monde
            await Clients.All.SendAsync("ChannelsList", await _context.Channel.ToListAsync());
        }

        public async Task DeleteChannel(int channelId)
        {
            Channel channel = await _context.Channel.FindAsync(channelId);
            if (channel != null)
            {
                _context.Channel.Remove(channel);
                await _context.SaveChangesAsync();

                string groupName = CreateChannelGroupName(channelId);

                // Forcer les clients dans ce channel à le quitter
                await Clients.Group(groupName).SendAsync("LeaveChannel");

                // Update global des channels
                await Clients.All.SendAsync("ChannelsList", await _context.Channel.ToListAsync());
            }
        }

        public async Task JoinChannel(int oldChannelId, int newChannelId)
        {
            // Quitter l'ancien groupe SignalR
            if (oldChannelId != 0)
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, CreateChannelGroupName(oldChannelId));
            }

            // Rejoindre le nouveau groupe SignalR
            if (newChannelId != 0)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, CreateChannelGroupName(newChannelId));
            }
        }

        public async Task SendMessage(string message, int channelId, string userId)
        {
            string userTag = $"[{CurentUser.Email}]";

            if (!string.IsNullOrEmpty(userId))
            {
                // MESSAGE PRIVÉ : Envoyer au UserId (SignalR gère tous les onglets de cet ID)
                await Clients.User(userId).SendAsync("NewMessage", $"{userTag} (Privé) : {message}");
                // On l'envoie aussi à soi-même pour l'afficher
                await Clients.Caller.SendAsync("NewMessage", $"{userTag} (à {userId}) : {message}");
            }
            else if (channelId != 0)
            {
                // MESSAGE DE GROUPE (Canal)
                await Clients.Group(CreateChannelGroupName(channelId)).SendAsync("NewMessage", $"{userTag} : {message}");
            }
            else
            {
                // MESSAGE GLOBAL
                await Clients.All.SendAsync("NewMessage", $"[Tous] {userTag} : {message}");
            }
        }

        // --- Helpers ---

        private async Task PushUserList()
        {
            var users = UserHandler.UserConnections.Select(uc => new {
                Key = uc.Key,
                Value = uc.Value
            }).ToList();
            await Clients.All.SendAsync("UsersList", users);
        }

        private static string CreateChannelGroupName(int channelId)
        {
            return "Channel" + channelId;
        }
    }
}