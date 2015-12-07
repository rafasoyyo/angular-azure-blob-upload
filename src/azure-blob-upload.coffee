###
    AngularJS Azure blob upload service with http post and progress.
    @author  Stephen Brannan - twitter: @kinstephen
    @colaborator Rafael Hernández Navarro - twitter: @rafa_soyyo
    @version 1.1.0

    config: {
                  baseUrl:    # baseUrl for blob file uri (i.e. http://<accountName>.blob.core.windows.net/<container>/<blobname>),
                  sasToken:   # Shared access signature querystring key/value prefixed with ? ( so add before "? + SAS" ),
                  file:       # File object using the HTML5 File API,
                  progress:   # progress callback function,
                  complete:   # complete callback function,
                  error:      # error callback function,
                  blockSize:  # Use this to override the DefaultBlockSize
            }
###

 
angular
    .module('azureBlobUpload', [])
    .factory('azureBlob', ['$http', ($http)->
        
        'use strict'
        
            # UPLOADS FUNCTIONS
        upload = (config) ->

            state = initializeState(config)
            reader = new FileReader

            reader.onloadend = (evt) ->
                if evt.target.readyState is FileReader.DONE and !state.cancelled

                    uri = state.fileUrl + '&comp=block&blockid=' + state.blockIds[state.blockIds.length - 1]
                    requestData = new Uint8Array(evt.target.result)
                    $http
                        .put(uri, requestData,
                            headers:
                                'x-ms-blob-type': 'BlockBlob'
                                'Content-Type'  : state.file.type
                            transformRequest: []
                        )
                        .success((data, status, headers, config) ->

                            state.bytesUploaded += requestData.length
                            percentComplete = (parseFloat(state.bytesUploaded) / parseFloat(state.file.size) * 100).toFixed(2)
                            if state.progress
                                state.progress percentComplete, data, status, headers, config
                                uploadFileInBlocks reader, state
                                
                        )
                        .error((data, status, headers, config) ->
                            if state.error then state.error data, status, headers, config
                        )

            uploadFileInBlocks(reader, state)

            return { 
                cancel: -> state.cancelled = true
            }


        DefaultBlockSize = 1024 * 32 # Default to 32KB
        initializeState = (config) ->
            blockSize       = if config.blockSize then config.blockSize else DefaultBlockSize
            maxBlockSize    = blockSize # Default Block Size
            numberOfBlocks  = 1
            file            = config.file
            fileSize        = file.size
            if (fileSize < blockSize) then maxBlockSize = fileSize # $log.log("max block size = " + maxBlockSize);
            numberOfBlocks = if fileSize % maxBlockSize is 0 then (fileSize / maxBlockSize) else ( parseInt(fileSize / maxBlockSize, 10) + 1 )

            return {
                maxBlockSize : maxBlockSize
                numberOfBlocks : numberOfBlocks
                totalBytesRemaining : fileSize
                currentFilePointer : 0
                blockIds : new Array
                blockIdPrefix : 'block-'
                bytesUploaded : 0
                submitUri : null
                file : file
                baseUrl  : config.baseUrl
                sasToken : config.sasToken
                fileUrl  : config.baseUrl + config.sasToken
                progress : config.progress
                complete : config.complete
                error    : config.error
                cancelled: false
            }


        uploadFileInBlocks = (reader, state) ->
            if !state.cancelled

                if state.totalBytesRemaining > 0

                    fileContent = state.file.slice(state.currentFilePointer, state.currentFilePointer + state.maxBlockSize)
                    blockId     = state.blockIdPrefix + pad(state.blockIds.length, 6)

                    state.blockIds.push btoa(blockId)
                    reader.readAsArrayBuffer fileContent

                    state.currentFilePointer += state.maxBlockSize
                    state.totalBytesRemaining -= state.maxBlockSize
                    if state.totalBytesRemaining < state.maxBlockSize
                        state.maxBlockSize = state.totalBytesRemaining
                else
                    commitBlockList state


        commitBlockList = (state) ->
            uri = state.fileUrl + '&comp=blocklist'

            requestBody = '<?xml version="1.0" encoding="utf-8"?><BlockList>'
            requestBody += '<Latest>' + b + '</Latest>' for b in state.blockIds
            requestBody += '</BlockList>'

            $http
                .put(uri, requestBody, 
                    headers: 'x-ms-blob-content-type': state.file.type
                )
                .success((data, status, headers, config) ->
                    if state.complete then state.complete data, status, headers, config
                )
                .error((data, status, headers, config) ->
                    if state.error then state.error data, status, headers, config
                )


        pad = (number, length) ->
            str = '' + number
            while str.length < length
                str = '0' + str
            return str



            # DOWNLOADS FUNCTIONS
        download = (config) ->
            state = initializeRequest(config)

            _Req = new XMLHttpRequest
            _Req.addEventListener 'progress', (e) -> state.progress (e.loaded * 100 / e.total).toFixed(0)
            _Req.addEventListener 'load',     (e) -> state.complete e.target.response, e
            _Req.addEventListener 'error',    (e) -> state.error e
            _Req.addEventListener 'abort',    (e) -> state.cancelled e
            _Req.responseType = 'blob'
            _Req.open 'get', state.fileUrl
            _Req.send()

            return { 
                cancel: -> _Req.abort()
            }

        initializeRequest = (config) ->
            return {
                baseUrl : config.baseUrl
                sasToken: config.sasToken
                fileUrl : config.baseUrl + config.sasToken
                progress: config.progress
                complete: config.complete
                error   : config.error
            }


            # RETURN METHODS 
        return {
            upload  : upload
            download: download
        }
    ])