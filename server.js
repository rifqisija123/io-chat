var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

connections = [];
let groupMessages = {}; // Menyimpan pesan per grup by qiidevv
let groupMembers = {}; // Menyimpan anggota per grup by qiidevv
let groupAdmins = {}; // Menyimpan admin grup by qiidevv
let groupNames = {}; // Menyimpan nama grup yang bisa di edit by qiidevv

http.listen(3000, () => {
    console.log('Server is Running on port 3000...');
});

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket) {
    connections.push(socket); // Menambah client ke array koneksi
    console.log('Connected: %s client sedang terhubung', connections.length);

    // Update jumlah client yang online ke semua client
    io.sockets.emit('update clients', { clientsCount: connections.length });

    // Ketika user join ke group
    socket.on('join', function(data) {
        socket.username = data.username;
        socket.group = data.group;
        socket.join(data.group);

        // Tambahkan pengguna ke daftar anggota grup
        if (!groupMembers[data.group]) {
            groupMembers[data.group] = []; // Buat array untuk anggota grup
            groupAdmins[data.group] = data.username; // Tetapkan pengguna pertama sebagai admin
            groupNames[data.group] = data.group; // Set nama grup default sesuai dengan input awal
        }

        // Tambahkan client ke daftar anggota grup jika belum ada
        if (!groupMembers[data.group].includes(data.username)) {
            groupMembers[data.group].push(data.username);
        }

        console.log('%s telah bergabung ke grup %s', data.username, data.group);

        // Kirim nama grup ke client saat bergabung
        io.to(socket.id).emit('group name', { name: groupNames[data.group] });

        // Kirim pesan bahwa pengguna baru telah bergabung ke grup
        io.to(socket.id).emit('group members', { members: groupMembers[data.group], admin: groupAdmins[data.group] });

        // Kirimkan riwayat pesan grup saat bergabung kembali
        if (groupMessages[data.group]) {
            io.to(socket.id).emit('load messages', groupMessages[data.group]);
        }

        io.sockets.to(data.group).emit('new message', {
            username: 'System',
            msg: `${data.username} telah bergabung ke grup`
        });
        io.sockets.to(data.group).emit('group members', { members: groupMembers[data.group], admin: groupAdmins[data.group] });
    });

    socket.on('edit group name', function(data) {
        if (groupAdmins[data.group] === socket.username) {
            // Update nama grup
            groupNames[data.group] = data.newName;
            // Broadcast nama grup baru ke semua anggota
            io.sockets.to(data.group).emit('group name', { name: data.newName });
            io.sockets.to(data.group).emit('new message', {
                username: 'System',
                msg: `Nama grup telah diubah menjadi ${data.newName}`
            });
        }
    });

    // Handle user sending message
    socket.on('send message', function(data) {
        let messageData = { username: data.username, msg: data.message };

        // Jika grup belum memiliki riwayat pesan, buat array pesan baru
        if (!groupMessages[data.group]) groupMessages[data.group] = [];

        // Tambahkan pesan ke riwayat pesan grup
        groupMessages[data.group].push(messageData);

        // Kirim pesan ke semua anggota group
        io.sockets.to(data.group).emit('new message', messageData);
    });

    socket.on('set admin', function(data) {
        if (groupAdmins[data.group] === socket.username) {
            groupAdmins[data.group] = data.newAdmin;
            io.sockets.to(data.group).emit('group members', { members: groupMembers[data.group], admin: groupAdmins[data.group] });
            io.sockets.to(data.group).emit('new message', { username: 'System', msg: `${data.newAdmin} sekarang adalah admin grup` });
        }
    });

    socket.on('remove member', function(data) {
        if (groupAdmins[data.group] === socket.username && data.username !== socket.username) {
            groupMembers[data.group] = groupMembers[data.group].filter(user => user !== data.username);

            // When kicked by the Admin, you will automatically leave the group
            const targetSocket = connections.find(conn => conn.username === data.username);
            if (targetSocket) {
                targetSocket.emit('kicked from group', { group: data.group });
            }

            io.sockets.to(data.group).emit('new message', { username: 'System', msg: `${data.username} telah dikeluarkan dari grup` });
            io.sockets.to(data.group).emit('group members', { members: groupMembers[data.group], admin: groupAdmins[data.group] });
        }
    });

    // Handle user leaving a group
    socket.on('leave group', function(data) {
        socket.leave(data.group);
        groupMembers[data.group] = groupMembers[data.group].filter(user => user !== data.username);
        
        // Jika admin yang meninggalkan, tetapkan anggota lain sebagai admin
        if (groupAdmins[data.group] === data.username) {
            groupAdmins[data.group] = groupMembers[data.group][0] || null; // Tetapkan admin baru atau null jika grup kosong
        }

        console.log('%s telah keluar dari grup %s', data.username, data.group);

        // Kirim pesan notifikasi bahwa anggota telah meninggalkan grup
        io.sockets.to(data.group).emit('new message', { username: 'System', msg: `${data.username} telah keluar dari grup` });
        // Perbarui daftar anggota untuk semua anggota grup
        io.sockets.to(data.group).emit('group members', { members: groupMembers[data.group], admin: groupAdmins[data.group] });
    });

    //Ketika ada yang Disconnect dari Server or App by qiidevv
    socket.on('disconnect', function(data) {
        connections.splice(connections.indexOf(socket), 1);
        console.log('Client disconnected: %s client tersisa yang sedang terhubung', connections.length);

        // Update jumlah client yang online ke semua client
        io.sockets.emit('update clients', { clientsCount: connections.length });
    });
});
