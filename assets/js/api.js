// This file contains javascript that allows a client machine to communicate with the server.

// It does this by doing HTTP requests to the server machine, which then returns the requested data

// This class contains functions that both the iframe and outer frame need
class API {
    constructor(path_to_upper = "") {
        this.path_to_upper = path_to_upper
    }

    async request(url, method = "GET", form_data = new FormData()) {
        return new Promise(resolve => {
            let xhttp = new XMLHttpRequest()
            xhttp.onreadystatechange = (e) => {
                if (xhttp.readyState === 4 && xhttp.status === 200) {
                    resolve(xhttp.responseText)
                }
            }

            xhttp.open(method, this.path_to_upper + url)
            xhttp.send(form_data)
        })
    }

    async get_playlist_contents(playlist_id) {
        return new Promise(async resolve => {
            // Uses the API to request information about a track
            let request = await this.request("api/get_tracks.php?playlist_id=" + playlist_id)
            console.log(request)
            let track_data = JSON.parse(request).data
            resolve(track_data)
        })
    }

    async get_track(track_id) {
        return new Promise(async resolve => {
            // Uses the API to request information about a track
            let request = await this.request("api/get_tracks.php?track_id=" + track_id)
            let track_data = JSON.parse(request).data[0]
            resolve(track_data)
        })
    }
}

// This class is used by the iframe. It is to allow the iframe to communicate with it's parent and the server
class iframe_class extends API {
    constructor() {
        // Setup a listener so that the iframe can receive information from the parent frame
        super("../");
        window.onmessage = this.message_receiver
    }

    message_receiver(e) {

    }

    set_queue(ids, playlist_name = "Individual Track", position = 0) {
        // Parameter must be an array of track ids
        window.top.postMessage(JSON.stringify(
            {
                command_type: 1, // Type 1 is set queue
                data: {
                    playlist_name: playlist_name,
                    ids: ids,
                    position: position
                }
            }
        ), "*")
        console.log("Posted data")
    }

    set_page_name(name) {
        window.top.postMessage(JSON.stringify(
            {
                command_type: 2, // Type 1 is set name
                data: name
            }
        ), "*")
    }

    async play_playlist(playlist_id, playlist_name = "Individual Track", position = 0) {
        return new Promise(async resolve => {
            let track_ids = []
            for (let track of await this.get_playlist_contents(playlist_id)) {
                track_ids.push(track["track_id"])
            }
            api.set_queue(track_ids, playlist_name, position)
        })
    }

    async play_individual_track(track_id) {
        api.set_queue([track_id], "Individual Track", 0)
    }

    send_iframe_to_page(location) {
        window.top.postMessage(JSON.stringify(
            {
                command_type: 3, // Type 3 is a go to page request
                data: location
            }
        ), "*")
    }

    send_iframe_backwards() {
        window.top.postMessage(JSON.stringify(
            {
                command_type: 4, // Type 4 goes back to the previous page
                data: null
            }
        ), "*")
    }
}

// This is for the outer frame. It allows the iframe to communicate with it, as well as all it to communicate with the server.
class outer_frame_class extends API {
    constructor(iframe_obj, player_obj) {
        super();
        // The constructor requires the iframe object, as other wise it will not be able to send or receive data from the iframe
        this.iframe = iframe_obj
        this.queue = []
        this.current_track = 0
        this.page_title = "Home"
        this.iframe_history = ["iframe/home.php"]

        // Setup a script that runs when the frame receives a message
        window.onmessage = this.message_receiver

        // Setup all the player elements
        try {
            this.player = {
                elements: {
                    skip_forwards: document.getElementById("skip_forwards"),
                    skip_backwards: document.getElementById("skip_backwards"),
                    toggle: document.getElementById("toggle"),
                    track_data: document.getElementById("track_data"),
                    snake: document.getElementById("player_snake"),
                    snake_slider: document.getElementById("player_snake_slider")
                },
                player_obj: player_obj,
                player_el: document.createElement("audio"),
                is_playing: false
            }
            document.body.onkeypress = (e) => {
                if (e.key === " ") {
                    api.toggle()
                }
            }
        }
        catch (e) {
            console.error("Could not attach all player elements to variables")
            console.error(e)
            return false
        }
        console.log(this.player)

        this.player.elements.skip_forwards.onclick = this.skip_forwards
        this.player.elements.skip_backwards.onclick = this.skip_backwards
        this.player.elements.toggle.onclick = this.toggle

        // Prepare script triggers for audio object
        this.player.player_el.addEventListener("ended", this.on_track_end)
        this.player.player_el.addEventListener("pause", this.on_track_pause)
        this.player.player_el.addEventListener("play", this.on_track_play)

        // Add draggable functionality to slider snake
        this.player.elements.slider_circle = document.getElementById("slide_circle")
        this.player.elements.snake.onmousedown = this.snake_mouse_down
    }

    async message_receiver(e) {
        console.log(e.data)
        console.log("Received data")
        let data = JSON.parse(e.data)

        // Detect what the iframe wants the outer frame to do
        if (data.command_type === 1) {
            // The iframe is telling the outer frame to set the queue
            // alert("Picked up a 'set queue' request")
            console.log("Picked up a set queue request")
            api.queue = data.data.ids
            api.current_track = data.data.position
            api.current_playlist_name = data.data.playlist_name
            await api.load_track()
        } else if (data.command_type === 2) {
            console.log("Picked up name change")
            console.log(data)
            api.page_title = data.data
            api.update_title()
        } else if (data.command_type === 3) {
            api.send_iframe_to_page(data.data)
        } else if (data.command_type === 4) {
            api.send_iframe_backwards()
        }
    }

    skip_forwards() {
        alert("Skipped forwards")
    }

    skip_backwards() {
        alert("Skipped backwards")
    }

    toggle() {
        if (this.player.is_playing) {
            this.player.player_el.pause()
        } else {
            this.player.player_el.play()
        }
    }

    async reset_player() {
        this.current_track = 0
        await this.load_track()
    }

    async download_audio(track_id) {
        return new Promise(resolve => {
            console.log("Making HTTP request...")
            let xhttp = new XMLHttpRequest()
            xhttp.onreadystatechange = (e) => {
                if (xhttp.readyState === 4 && xhttp.status === 200) {
                    console.log(xhttp)
                    // let blob = new Blob([xhttp.response], {type: "audio/mpeg"})
                    resolve(xhttp.response)
                }
            }

            xhttp.responseType = "blob"
            xhttp.open("GET", "api/return_track_file.php?track_id=" + track_id)
            xhttp.send()
        })
    }

    async load_track() {
        // console.log(this)
        let track_data = await this.get_track(this.queue[this.current_track])
        console.log(track_data)
        // Get details for the next track

        // Show little animation while downloading track
        api.player.elements.toggle.classList.add("spin")
        let blob = await api.download_audio(this.queue[this.current_track])
        api.player.elements.toggle.classList.remove("spin")

        console.log(blob)
        api.player.player_el.src = URL.createObjectURL(blob)
        api.player.player_el.type = "audio/mpeg"
        await api.player.player_el.play()
        this.player.track = track_data

        // Set track details
        this.player.elements.track_data.innerHTML = "<strong>" + track_data.title + "</strong><br><i>" + api.current_playlist_name + "</i>"

        api.player.start = new Date()
        // await api.player.player_el.play()
    }

    async on_track_end() {
        console.log("Track ended")
        api.player.is_playing = false
        clearInterval(api.player.snake_interval)
        api.player.elements.snake_slider.style.width = "0%"
        api.update_title()

        // Detect if player has another track to move on to
        if (api.queue.length > api.current_track) {
            api.current_track += 1
            api.load_track()
        }
    }

    async on_track_pause() {
        console.log("Track paused")
        api.player.is_playing = false
        api.update_title()
        clearInterval(api.player.snake_interval)

        api.player.elements.toggle.src = "assets/icons/icon.svg"
        api.player.elements.toggle.onclick = () => {
            api.player.player_el.play()
        }
    }

    async on_track_play() {
        console.log("Tracking playing")
        api.player.is_playing = true
        api.update_title()

        api.player.elements.toggle.src = "assets/icons/icon_pause.svg"
        api.player.elements.toggle.onclick = () => {
            api.player.player_el.pause()
        }
        api.player.snake_interval = setInterval(api.update_snake, 10)
    }

    update_snake() {
        api.player.elements.snake_slider.style.width = (api.player.player_el.currentTime / api.player.player_el.duration) * 100 + "%"
        let bounding_box = api.player.elements.snake_slider.getBoundingClientRect()
        api.player.elements.slider_circle.style.left = "calc(calc(calc(100vw - 40px) * " + (api.player.player_el.currentTime / api.player.player_el.duration) + ") + 15px)"
        api.player.elements.slider_circle.style.top = (bounding_box.y - 2.5) + "px"
    }

    update_title() {
        console.log(api.iframe_history)
        if (typeof this.player.track !== "undefined") {
            if (this.player.is_playing) {
                window.document.title = "🎵 " + this.player.track.title + " - " + this.page_title + " - Graeme's Music"
            } else {
                window.document.title = this.player.track.title + " - " + this.page_title + " - Graeme's Music"
            }
        } else {
            window.document.title = this.page_title + " - Graeme's Music"
        }
    }

    send_iframe_to_page(location) {
        api.iframe.src = location
        api.iframe_history.push(location)
        document.getElementById('large_menu_frame').style.display = 'none'
    }

    send_iframe_backwards() {
        if (api.iframe_history.length !== 1) {
            api.iframe_history = api.iframe_history.slice(0, -1)
        }
        console.log(api.iframe_history[api.iframe_history.length - 1])
        api.iframe.src = api.iframe_history[api.iframe_history.length - 1]
    }

    snake_mouse_down(e) {
        e = e || window.event
        e.preventDefault()
        console.log("slider circle pressed")

        // Pause the music
        api.resume_after_drag = api.player.is_playing
        api.player.player_el.pause()

        document.onmouseup = (e) => {api.snake_drag_end(e)}
        document.onmousemove = (e) => {api.snake_drag(e)}
        api.player.elements.slider_circle.style.opacity = "1"
        console.log("HERE!")
    }

    snake_drag(e) {
        console.log("Snake moved")

        e = e || window.event
        e.preventDefault()

        // Make sure that the snake won't try and reset itself
        clearInterval(api.player.snake_interval)

        let snake_bounding_box = api.player.elements.snake.getBoundingClientRect()

        if (e.clientX >= snake_bounding_box.x && e.clientX <= snake_bounding_box.x + snake_bounding_box.width) {
            api.player.elements.slider_circle.style.left = (e.clientX - 5) + "px"
            api.player.elements.snake_slider.style.width = (((e.clientX - snake_bounding_box.x) / snake_bounding_box.width) * 100) + "%"
        }
    }

    snake_drag_end(e) {
        console.log("Drag ended")
        document.onmouseup = null;
        document.onmousemove = null;
        api.player.elements.slider_circle.style.opacity = ""

        // Navigate the audio player

        // Calculate what point the player needs to be set to
        let snake_bounding_box = api.player.elements.snake.getBoundingClientRect()
        let percent = ((e.clientX - snake_bounding_box.x) / snake_bounding_box.width)
        api.player.player_el.currentTime = api.player.player_el.duration * percent

        if (api.resume_after_drag) api.player.player_el.play()
    }
}