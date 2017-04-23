define(['exports'], function (exports) {
  'use strict';

  var remote = require('remote');
  var os = require('os');
  var $ = require('jquery');
  var db = remote.require('./vendor/candoia/datastore');
  var appManager = remote.require('./vendor/candoia/app-manager');
  var instManager = remote.require('./vendor/candoia/instance-manager');
  var repoManager = remote.require('./vendor/candoia/repo-manager');
  var dialog = remote.require('dialog');
  var paneManager = require('./vendor/candoia/pane-manager');
  var pane = require('./vendor/candoia/pane');
  var meta = require('./vendor/candoia/app-meta');
  var Menu = remote.require('menu');
  var MenuItem = remote.require('menu-item');
  var request = remote.require('request');
  var jetpack = remote.require('fs-jetpack');
  var Q = require('q');
  var fs = require('fs');

  var manifest = jetpack.read(__dirname + '/package.json', 'json');

  var repos = [];
  var appMenu = undefined;

  function loadRepos() {
    var tree = $('#repo-tree');
    tree.html('');
    repoManager.load().then(function (docs) {
      repos = docs;
      for (var i = 0; i < docs.length; i++) {
        var _item = $('<a class="menu-item repo-shortcut" data-repo="' + i + '"></a>');
        var tmpl = '\n        <i class=\'fa fa-fw fa-book tree-icon\'></i>\n        <span class=\'tree-text\'>' + docs[i].name + '</span>';
        _item.html(tmpl);
        tree.append(_item);
      }
      var item = $('<a class=\'menu-item\' id="insert-repo"></a>');
      item.html('\n      <i class=\'fa fa-fw fa-plus tree-icon\'></i>\n      <span class=\'tree-text\'>Add Repository</span>');
      tree.append(item);
    });
  }

  function loadApps() {
    appMenu = new Menu();
    appManager.all().then(function (apps) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        var _loop = function () {
          var app = _step.value;

          appMenu.append(new MenuItem({
            'type': 'normal',
            'label': app['package'].productName,
            'click': function click() {
              createAppInstance(app);
            }
          }));
        };

        for (var _iterator = apps[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          _loop();
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator['return']) {
            _iterator['return']();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      appMenu.append(new MenuItem({ type: 'separator' }));
      appMenu.append(new MenuItem({
        'type': 'normal',
        'label': 'configuration',
        'click': configRepo
      }));
      appMenu.append(new MenuItem({ type: 'separator' }));
      appMenu.append(new MenuItem({
        'type': 'normal',
        'label': 'remove repository',
        'click': removeRepo
      }));
    });
  }

  function versionCompare(v1, v2) {
    if (v1 === v2) return 0;

    v1 = v1.slice(1, v1.length);
    v2 = v2.slice(1, v2.length);

    var v1Parts = v1.split('.');
    var v2Parts = v2.split('.');

    var len = Math.min(v1Parts.length, v2Parts.length);

    for (var i = 0; i < len; i++) {
      if (parseInt(v1Parts[i]) > parseInt(v2Parts[i])) return 1;
      if (parseInt(v1Parts[i]) < parseInt(v2Parts[i])) return -1;
    }

    if (v1Parts.length > v2Parts.length) return 1;
    if (v1Parts.length < v2Parts.length) return -1;

    return 0;
  }

  function checkVersion() {
    var options = {
      url: 'http://design.cs.iastate.edu/candoia/dist/version.json',
      headers: {
        'User-Agent': 'node-http/3.1.0'
      }
    };

    request.get(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        try {
          var info = JSON.parse(body);
          var diff = versionCompare(manifest.version, info.latest);
          if (diff >= 0) {
            $('.footer').append('<p style=\'margin: 8px; float: right;\'>\n            Candoia is up to date\n            <i class=\'fa fa-fw fa-smile-o\'></i>\n          </p>');
          } else {
            $('.footer').append('<a href=\'http://candoia.org\' class=\'js-external-link btn-link\' style=\'float: right;\'>\n            There is an update (' + info.latest + ') avaliable!\n            <i class=\'fa fa-fw fa-warning\'></i>\n          </a>');
          }
        } catch (e) {
          console.log(e);
        }
      }
    });
  }

  loadRepos();
  loadApps();
  checkVersion();

  var curRepo = null;

  $(document).on('contextmenu', '.repo-shortcut', function (e) {
    curRepo = $(this).data('repo');
    e.preventDefault();
    appMenu.popup(remote.getCurrentWindow());
  });

  function removeRepo() {
    var repo = repos[curRepo];
    repoManager.remove(repo._id).then(loadRepos);
  }

  var scaff = fs.readFileSync(__dirname + '/css/scaffolding.css', { encoding: 'utf8' });

  function createAppInstance(app) {
    var repo = repos[curRepo];
    console.log("repo:" + repo.remote + " and " + repo.bug);
    paneManager.createAppInstance(app, repo);
  }

  var toggle = $('#side-panel-toggle');
  var panel = $('#side-panel');
  var open = true;
  var w = '200px';

  $('#side-panel-toggle').on('click', function () {
    open = !open;
    panel.css('width', open ? w : 0);
    var dir = open ? 'left' : 'right';
    toggle.html('<i class="fa fa-fw fa-angle-double-' + dir + '"></i>');
  });

  function makeConfigModal(options) {
    var name = options.name || '';
    var local = options.local || '';
    var remote = options.remote || '';

    return '\n  <div class=\'modal\'>\n    <div class=\'modal-header\'><i class=\'fa fa-fw fa-book\'></i> Configure Repository</div>\n    <div class=\'modal-content\'>\n      <label class=\'modal-label\' for=\'input-repo-name\'>\n        Name\n      </label>\n      <p>The name will be displayed on the sidebar to the left</p>\n      <div class=\'modal-input\'>\n        <input id=\'input-repo-name\' type=\'text\' value=\'' + name + '\'>\n      </div>\n      <label class=\'modal-label\' for=\'input-repo-location\'>\n        Local Path\n      </label>\n      <p>If you have a .git repository already downloaded, add the absolute path to the repository</p>\n      <div class=\'modal-input\'>\n        <input id=\'input-repo-location\' type=\'text\' value=\'' + local + '\'>\n      </div>\n      <label class=\'modal-label\' for=\'input-repo-remote\'>\n        Remote github URL\n      </label>\n      <p>If you do not have a .git repository downloaded, then add a remote github URL. For example : "https://github.com/junit-team/junit"</p>\n      <div class=\'modal-input\'>\n        <input id=\'input-repo-remote\' type=\'text\' value=\'' + remote + '\'>\n      </div>\n      <div class=\'modal-actions form-actions\'>\n        <input class=\'modal-footer-mute\' id=\'input-repo-id\' type=\'text\' value=\'' + options._id + '\' disabled>\n        <button id=\'confirm-repo-edit\' class=\'modal-confirm btn btn-sm btn-primary\' type=\'button\'>confirm</button>\n        <button id=\'cancel-repo-add\' class=\'modal-cancel btn btn-sm\' type=\'button\'>cancel</button>\n      </div>\n    </div>\n  </div>';
  }

  function makeRepoModal(options) {
    return '\n  <div class=\'modal\'>\n    <div class=\'modal-header\'><i class=\'fa fa-fw fa-book\'></i> Add Repository</div>\n    <div class=\'modal-content\'>\n      <label class=\'modal-label\' for=\'input-repo-name\'>\n        Name\n      </label>\n      <p>The name will be displayed on the sidebar to the left</p>\n      <div class=\'modal-input\'>\n        <input id=\'input-repo-name\' type=\'text\'>\n      </div>\n      <label class=\'modal-label\' for=\'input-repo-location\'>\n        Local Path\n      </label>\n      <p>If you have a .git repository already downloaded, add the absolute path to the repository</p>\n      <div class=\'modal-input\'>\n        <input id=\'input-repo-location\' type=\'text\'>\n      </div>\n      <label class=\'modal-label\' for=\'input-repo-remote\'>\n        Remote github URL\n      </label>\n      <p>If you do not have a .git repository downloaded, then add a remote github URL. For example : "https://github.com/junit-team/junit"</p>\n      <div class=\'modal-input\'>\n        <input id=\'input-repo-remote\' type=\'text\' value="https://github.com/">\n      </div>\n\n      </div>\n      <label class=\'modal-label\' for=\'input-repo-bug\'>\n        Remote BugUrl\n      </label>\n      <p>Add a remote bug URL. For example : "https://github.com/junit-team/junit"</p>\n      <div class=\'modal-input\'>\n        <input id=\'input-repo-bug\' type=\'text\' value="https://github.com/">\n      </div>\n\n      <div class=\'modal-actions form-actions\'>\n        <button id=\'confirm-repo-add\' class=\'modal-confirm btn btn-sm btn-primary\' type=\'button\'>confirm</button>\n        <button id=\'cancel-repo-add\' class=\'modal-cancel btn btn-sm\' type=\'button\'>cancel</button>\n      </div>\n    </div>\n  </div>';
  }

  function makeAppModal(options) {
    return '\n  <div class=\'modal\' style=\'width:800px\'>\n    <div class=\'modal-header\'><i class=\'fa fa-fw fa-rocket\'></i> Install Application</div>\n    <div class=\'modal-content\'>\n      <div class=\'app-list\'>\n        Loading Apps&hellip; <i class=\'fa fa-fw fa-cog fa-spin\'></i>\n      </div>\n      <div class=\'modal-actions form-actions\'>\n        <!--<button id=\'confirm-app-add\' class=\'modal-confirm btn btn-sm btn-primary\' type=\'button\'>install</button>-->\n        <button id=\'cancel-app-add\' class=\'modal-cancel btn btn-sm\' type=\'button\'>cancel</button>\n        <button id=\'local-app-add\' class=\'btn btn-sm\' type=\'button\'>install from local</button>\n      </div>\n    </div>\n  </div>';
  }

  function makeLocalAppModal(options) {
    return '\n    <div class=\'modal\' style=\'width:600px\'>\n      <div class=\'modal-header\'><i class=\'fa fa-fw fa-rocket\'></i> Install Local Application</div>\n      <div class=\'modal-content\'>\n        <label>Path to local application package.json</label>\n        <p class=\'note\'>A path on your machine to the package.json for the app you want to install.</p>\n        <div class="input-group">\n          <input type="text" class="input-contrast" id=\'input-app-local\' placeholder="/path/to/package.json">\n          <span class="input-group-button">\n            <button class="btn" id=\'input-app-local-browse\'>\n              browse\n            </button>\n          </span>\n        </div>\n        <div class="form-checkbox">\n          <label>\n            <input type="checkbox" id=\'input-app-dev\'>\n            Developer mode\n          </label>\n          <p class="note">\n            Developer mode will give you chrome developer tools for your app.\n          </p>\n        </div>\n\n        <div class=\'modal-actions form-actions\'>\n          <button id=\'confirm-local-app-add\' class=\'btn btn-sm btn-primary\' type=\'button\'>Install</button>\n          <button id=\'cancel-local-app-add\' class=\'modal-cancel btn btn-sm\' type=\'button\'>cancel</button>\n        </div>\n      </div>\n    </div>';
  }

  function makeAboutModal(options) {
    return '\n  <div class=\'modal\'>\n    <div class=\'modal-header\'><i class=\'fa fa-fw fa-info-circle\'></i> About Candoia</div>\n    <div class=\'modal-content\'>\n      <h4>Contributors</h4>\n      <p>Candoia platform is developed at Iowa State University. The development\n      is led by Hridesh Rajan (@hridesh) and project contributors include Nitin\n      Tiwari (@nmtiwari), Ganesha Upadhyaya (@gupadhyaya), Dalton Mills\n      (@ddmills), Eric Lin (@eyhlin), and Trey Erenberger (@TErenberger).</p>\n\n      <h4>Version Info</h4>\n      <p>\n        Candoia: v' + options.version + '<br>\n        Boa Core: v' + options.boa + '\n      </p>\n\n      <h4>License</h4>\n\n      <p>Copyright (c) 2015 Iowa State University of Science and Technology.</p>\n\n      <p>Permission is hereby granted, free of charge, to any person obtaining a\n      copy of this software and associated documentation files (the "Software"),\n      to deal in the Software without restriction, including without limitation\n      the rights to use, copy, modify, merge, publish, distribute, sublicense,\n      and/or sell copies of the Software, and to permit persons to whom the\n      Software is furnished to do so, subject to the following conditions:</p>\n\n      <p>The above copyright notice and this permission notice shall be included\n      in all copies or substantial portions of the Software.</p>\n\n      <p>THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS\n      OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n      FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n      AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n      LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\n      FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER\n      DEALINGS IN THE SOFTWARE.</p>\n\n      <div class=\'modal-actions form-actions\'>\n        <button id=\'close-about\' class=\'modal-cancel btn btn-sm\' type=\'button\'>close</button>\n      </div>\n    </div>\n  </div>';
  }

  var curtain = $('.curtain');

  function getLatestApps() {
    var deferred = Q.defer();
    var options = {
      url: 'http://design.cs.iastate.edu/candoia/dist/apps.json',
      headers: {
        'User-Agent': 'node-http/3.1.0'
      }
    };

    request.get(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        try {
          var info = JSON.parse(body);
          deferred.resolve(info);
        } catch (e) {
          console.log(e);
        }
      }
    });

    return deferred.promise;
  }

  $(document).on('click', '#insert-repo', function () {
    var modal = $(makeRepoModal());
    modal.hide();
    curtain.html(modal);
    curtain.fadeIn(250, function () {
      modal.slideDown();
    });
  });

  $(document).on('click', '#local-app-add', function () {
    var modal = $(makeLocalAppModal());
    modal.hide();
    curtain.html(modal);
    curtain.fadeIn(250, function () {
      modal.slideDown();
    });
  });

  $(document).on('click', '#install-app', function () {
    var modal = $(makeAppModal());
    modal.hide();
    curtain.html(modal);
    curtain.fadeIn(250, function () {
      modal.slideDown();
    });

    getLatestApps().then(function (info) {
      var appList = modal.find('.app-list');

      var drawApp = function drawApp(appMeta) {
        appList.html('');
        appManager.find(appMeta.name).then(function (app) {
          var btn = '<button type=\'button\' data-name=\'' + appMeta.name + '\' class=\'btn btn-sm btn-install-app\'>install</button>';

          // check if the app is already installed
          if (app.length > 0) {
            var cnt = meta.contents(app);
            var compare = versionCompare(cnt.version, appMeta.version);

            if (compare < 0) {
              btn = '<button type=\'button\' data-name=\'' + appMeta.name + '\' class=\'btn btn-sm btn-install-app\'>update</button>';
            } else {
              btn = '<button type=\'button\' class=\'btn btn-sm disabled\'>installed</button>';
            }
          }

          appList.append('\n          <div class=\'app-list-item\'>\n            <h4 class=\'app-list-item-name\'>\n              <i class=\'fa fa-fw fa-' + appMeta.icon.name + '\'></i>\n              ' + appMeta.productName + '\n            </h4>\n\n            <p class=\'app-list-item-desciption\'>\n              ' + appMeta.description + '\n            </p>\n\n            <span class=\'app-list-item-version\'>\n              v' + appMeta.version + '\n            </span>\n\n            ' + btn + '\n            <span class=\'clearfix\'></span>\n          </div>');
        });
      };

      for (var i = 0; i < info['apps'].length; i++) {
        var app = info['apps'][i];
        drawApp(app);
      }
    });
  });

  $(document).on('click', '#goto-about', function () {
    var modal = $(makeAboutModal(manifest));
    modal.hide();
    curtain.html(modal);
    curtain.fadeIn(250, function () {
      modal.slideDown();
    });
  });

  function configRepo() {
    var repo = repos[curRepo];
    var modal = $(makeConfigModal(repo));
    modal.hide();
    curtain.html(modal);
    curtain.fadeIn(250, function () {
      modal.slideDown();
    });
  }

  $(document).on('click', '#input-app-local-browse', function () {
    dialog.showOpenDialog({
      filters: [{ name: 'Package', extensions: ['json'] }],
      properties: ['openFile']
    }, function (fileNames) {
      if (fileNames.length > 0) {
        $('#input-app-local').val(fileNames[0]);
      }
    });
  });

  $(document).on('click', '#confirm-local-app-add', function () {
    var location = $('#input-app-local').val();
    var dev = $('#input-app-dev').prop('checked');

    appManager.installLocal(location, dev).then(function (app) {
      appMenu.insert(0, new MenuItem({
        'type': 'normal',
        'label': app['package'].productName,
        'click': function click(r) {
          paneManager.createAppInstance(app, repos[curRepo]);
        }
      }));
      $('.modal-content').html('\n        <i class=\'fa fa-fw fa-rocket\'></i> ' + app['package'].productName + ' has been installed! <br />\n        <div class=\'modal-actions form-actions\'>\n          <button id=\'cancel-app-add\' class=\'modal-cancel btn btn-sm\' type=\'button\'>close</button>\n        </div>\n    ');
    }, function (err) {
      $('.modal-content').html('\n        <div class="flash flash-warn">\n          <i class="fa fa-fw fa-warning"></i>' + err + '\n        </div><br />\n        <button type=\'button\' id=\'cancel-repo-add\' class=\'modal-cancel btn btn-sm\'>cancel</button>\n    ');
    });
  });

  $(document).on('click', '.btn-install-app', function () {
    var name = $(this).data('name');
    $('.modal-content').html('<i class="fa fa-fw fa-cog fa-spin fa-lg"></i> Retrieving app meta data');
    $('.modal-content').css('text-align', 'center');
    appManager.info(name).then(function (info) {
      var v = info[0].tag_name;
      $('.modal-content').html('<i class="fa fa-fw fa-cog fa-spin fa-lg"></i> Meta data retrieved. Downloading latest version: ' + v);
      appManager.install(name, v).then(function (app) {
        if (app) {
          appMenu.insert(0, new MenuItem({
            'type': 'normal',
            'label': app['package'].productName,
            'click': function click(r) {
              paneManager.createAppInstance(app, repos[curRepo]);
            }
          }));
        }
        $('.modal-content').html('<i class=\'fa fa-fw fa-rocket\'></i> ' + name + ' has been installed! <br /><div class=\'modal-actions form-actions\'><button id=\'cancel-app-add\' class=\'modal-cancel btn btn-sm\' type=\'button\'>close</button></div>');
      })['catch'](function (error) {
        $('.modal-content').html('<i class=\'fa fa-fw fa-warning\'></i> Encountered error while trying to download latest app version: ' + error + ' <br /><div class=\'modal-actions form-actions\'><button id=\'cancel-app-add\' class=\'modal-cancel btn btn-sm\' type=\'button\'>cancel</button></div>');
      });
    })['catch'](function (error, o) {
      $('.modal-content').html('<i class=\'fa fa-fw fa-warning\'></i> Invalid application name. ' + error + ' <br /> <div class=\'modal-actions form-actions\'><button id=\'cancel-app-add\' class=\'modal-cancel btn btn-sm\' type=\'button\'>cancel</button></div>');
    });
  });

  $(document).on('click', '#confirm-repo-add', function () {
    var name = $('#input-repo-name').val();
    var local = $('#input-repo-location').val();
    var remote = $('#input-repo-remote').val();
    var bug = $('#input-repo-bug').val();
    console.log('bug:' + bug);
    $('.modal-content').html('<i class="fa fa-fw fa-cog fa-spin fa-lg"></i>');
    $('.modal-content').css('text-align', 'center');
    repoManager.add(name, local, remote, bug).then(function (repo) {
      loadRepos();
      curtain.fadeOut(500);
      curtain.html('');
    }, function (err) {
      $('.modal-content').html('<div class="flash flash-warn">' + err + '</div><br /><button type=\'button\' id=\'cancel-repo-add\' class=\'modal-cancel btn btn-sm\'>cancel</button>');
    });
  });

  $(document).on('click', '#confirm-repo-edit', function () {
    var id = $('#input-repo-id').val();
    var name = $('#input-repo-name').val();
    var local = $('#input-repo-location').val();
    var remote = $('#input-repo-remote').val();

    $('.modal-content').html('<i class="fa fa-fw fa-cog fa-spin fa-lg"></i>');
    $('.modal-content').css('text-align', 'center');

    repoManager.update(id, name, local, remote).then(function (repo) {
      loadRepos();
      curtain.fadeOut(500);
      curtain.html('');
    }, function (err) {
      $('.modal-content').html('<div class="flash flash-warn">' + err + '</div><br /><button type=\'button\' id=\'cancel-repo-add\' class=\'modal-cancel btn btn-sm\'>cancel</button>');
    });
  });

  $(document).on('click', '.modal-cancel', function () {
    curtain.fadeOut(500);
    curtain.html('');
  });

  var envName = window.env.name;
});
//# sourceMappingURL=app.js.map
