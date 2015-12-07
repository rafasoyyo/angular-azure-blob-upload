
/*
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
 */
angular.module('azureBlobUpload', []).factory('azureBlob', [
  '$http', function($http) {
    'use strict';
    var DefaultBlockSize, commitBlockList, download, initializeRequest, initializeState, pad, upload, uploadFileInBlocks;
    upload = function(config) {
      var reader, state;
      state = initializeState(config);
      reader = new FileReader;
      reader.onloadend = function(evt) {
        var requestData, uri;
        if (evt.target.readyState === FileReader.DONE && !state.cancelled) {
          uri = state.fileUrl + '&comp=block&blockid=' + state.blockIds[state.blockIds.length - 1];
          requestData = new Uint8Array(evt.target.result);
          return $http.put(uri, requestData, {
            headers: {
              'x-ms-blob-type': 'BlockBlob',
              'Content-Type': state.file.type
            },
            transformRequest: []
          }).success(function(data, status, headers, config) {
            var percentComplete;
            state.bytesUploaded += requestData.length;
            percentComplete = (parseFloat(state.bytesUploaded) / parseFloat(state.file.size) * 100).toFixed(2);
            if (state.progress) {
              state.progress(percentComplete, data, status, headers, config);
              return uploadFileInBlocks(reader, state);
            }
          }).error(function(data, status, headers, config) {
            if (state.error) {
              return state.error(data, status, headers, config);
            }
          });
        }
      };
      uploadFileInBlocks(reader, state);
      return {
        cancel: function() {
          return state.cancelled = true;
        }
      };
    };
    DefaultBlockSize = 1024 * 32;
    initializeState = function(config) {
      var blockSize, file, fileSize, maxBlockSize, numberOfBlocks;
      blockSize = config.blockSize ? config.blockSize : DefaultBlockSize;
      maxBlockSize = blockSize;
      numberOfBlocks = 1;
      file = config.file;
      fileSize = file.size;
      if (fileSize < blockSize) {
        maxBlockSize = fileSize;
      }
      numberOfBlocks = fileSize % maxBlockSize === 0 ? fileSize / maxBlockSize : parseInt(fileSize / maxBlockSize, 10) + 1;
      return {
        maxBlockSize: maxBlockSize,
        numberOfBlocks: numberOfBlocks,
        totalBytesRemaining: fileSize,
        currentFilePointer: 0,
        blockIds: new Array,
        blockIdPrefix: 'block-',
        bytesUploaded: 0,
        submitUri: null,
        file: file,
        baseUrl: config.baseUrl,
        sasToken: config.sasToken,
        fileUrl: config.baseUrl + config.sasToken,
        progress: config.progress,
        complete: config.complete,
        error: config.error,
        cancelled: false
      };
    };
    uploadFileInBlocks = function(reader, state) {
      var blockId, fileContent;
      if (!state.cancelled) {
        if (state.totalBytesRemaining > 0) {
          fileContent = state.file.slice(state.currentFilePointer, state.currentFilePointer + state.maxBlockSize);
          blockId = state.blockIdPrefix + pad(state.blockIds.length, 6);
          state.blockIds.push(btoa(blockId));
          reader.readAsArrayBuffer(fileContent);
          state.currentFilePointer += state.maxBlockSize;
          state.totalBytesRemaining -= state.maxBlockSize;
          if (state.totalBytesRemaining < state.maxBlockSize) {
            return state.maxBlockSize = state.totalBytesRemaining;
          }
        } else {
          return commitBlockList(state);
        }
      }
    };
    commitBlockList = function(state) {
      var b, i, len, ref, requestBody, uri;
      uri = state.fileUrl + '&comp=blocklist';
      requestBody = '<?xml version="1.0" encoding="utf-8"?><BlockList>';
      ref = state.blockIds;
      for (i = 0, len = ref.length; i < len; i++) {
        b = ref[i];
        requestBody += '<Latest>' + b + '</Latest>';
      }
      requestBody += '</BlockList>';
      return $http.put(uri, requestBody, {
        headers: {
          'x-ms-blob-content-type': state.file.type
        }
      }).success(function(data, status, headers, config) {
        if (state.complete) {
          return state.complete(data, status, headers, config);
        }
      }).error(function(data, status, headers, config) {
        if (state.error) {
          return state.error(data, status, headers, config);
        }
      });
    };
    pad = function(number, length) {
      var str;
      str = '' + number;
      while (str.length < length) {
        str = '0' + str;
      }
      return str;
    };
    download = function(config) {
      var _Req, state;
      state = initializeRequest(config);
      _Req = new XMLHttpRequest;
      _Req.addEventListener('progress', function(e) {
        return state.progress((e.loaded * 100 / e.total).toFixed(0));
      });
      _Req.addEventListener('load', function(e) {
        return state.complete(e.target.response, e);
      });
      _Req.addEventListener('error', function(e) {
        return state.error(e);
      });
      _Req.addEventListener('abort', function(e) {
        return state.cancelled(e);
      });
      _Req.responseType = 'blob';
      _Req.open('get', state.fileUrl);
      _Req.send();
      return {
        cancel: function() {
          return _Req.abort();
        }
      };
    };
    initializeRequest = function(config) {
      return {
        baseUrl: config.baseUrl,
        sasToken: config.sasToken,
        fileUrl: config.baseUrl + config.sasToken,
        progress: config.progress,
        complete: config.complete,
        error: config.error
      };
    };
    return {
      upload: upload,
      download: download
    };
  }
]);
